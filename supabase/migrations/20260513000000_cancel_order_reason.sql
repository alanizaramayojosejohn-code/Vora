-- ---------------------------------------------------------------------------
-- Add cancel_reason to orders and update cancel_order RPC
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists cancel_reason text;

-- Update cancel_order to accept and store the cancellation reason
create or replace function cancel_order(p_order_id uuid, p_cancel_reason text)
returns void language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_rec         record;
begin
  v_business_id := current_user_business_id();

  -- Verify order belongs to the caller's business and is not already cancelled
  select id into v_rec
  from orders
  where id = p_order_id
    and business_id = v_business_id
    and cancelled_at is null;

  if not found then
    raise exception 'order not found or already cancelled';
  end if;

  -- Restore stock for each product item
  update products p
  set stock = p.stock + oi.quantity
  from order_items oi
  where oi.order_id = p_order_id
    and oi.product_id = p.id
    and p.has_stock = true;

  -- Mark cancelled with reason
  update orders
  set cancelled_at    = now(),
      cancelled_by    = auth.uid(),
      cancel_reason   = p_cancel_reason
  where id = p_order_id;
end;
$$;
