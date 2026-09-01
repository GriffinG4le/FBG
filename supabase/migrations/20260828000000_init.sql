-- Create Catalog Table
CREATE TABLE IF NOT EXISTS catalog (
    sku text PRIMARY KEY,
    category text NOT NULL,
    color text,
    size text,
    price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
    qty integer NOT NULL DEFAULT 0
);

-- Create Ledger Table
CREATE TABLE IF NOT EXISTS ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_ref text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('Online', 'Event', 'Card', 'Manual')),
    sku text NOT NULL REFERENCES catalog(sku) ON UPDATE CASCADE,
    qty_change integer NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('Intent', 'Dispatch', 'Swap', 'Correction')),
    amount numeric NOT NULL DEFAULT 0,
    swap_of uuid REFERENCES ledger(id) ON DELETE SET NULL,
    notes text,
    operator text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Create Trigger Function to Automatically Update Catalog Stock Quantity
CREATE OR REPLACE FUNCTION update_catalog_qty()
RETURNS TRIGGER AS $$
DECLARE
    old_row RECORD;
BEGIN
    -- If it's a Swap, check if it replaces a stock-affecting row and refund the old stock
    IF NEW.event_type = 'Swap' AND NEW.swap_of IS NOT NULL THEN
        SELECT * INTO old_row FROM ledger WHERE id = NEW.swap_of;
        IF FOUND THEN
            -- If the old row was Dispatch, Swap, or Correction (which affected stock), reverse its effect
            IF old_row.event_type IN ('Dispatch', 'Swap', 'Correction') THEN
                UPDATE catalog
                SET qty = qty - old_row.qty_change
                WHERE sku = old_row.sku;
            END IF;
        END IF;
    END IF;

    -- Update catalog qty for the new item (only if it is not an Intent row)
    IF NEW.event_type != 'Intent' THEN
        UPDATE catalog
        SET qty = qty + NEW.qty_change
        WHERE sku = NEW.sku;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger to Ledger Table
CREATE OR REPLACE TRIGGER trg_ledger_update_qty
AFTER INSERT ON ledger
FOR EACH ROW
EXECUTE FUNCTION update_catalog_qty();

-- Create Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ledger_order_ref ON ledger(order_ref);
CREATE INDEX IF NOT EXISTS idx_ledger_sku ON ledger(sku);
CREATE INDEX IF NOT EXISTS idx_ledger_event_type ON ledger(event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_swap_of ON ledger(swap_of);
