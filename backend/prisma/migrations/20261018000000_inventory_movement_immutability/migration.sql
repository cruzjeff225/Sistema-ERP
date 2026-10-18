-- RN-INV-007: los movimientos confirmados no se editan ni se eliminan fisicamente; las correcciones se
-- registran como reversion o ajuste. Solo una transaccion de mantenimiento que declare
-- erp.allow_movement_changes = 'on' puede alterar el historial (scripts de pruebas y de limpieza).
CREATE FUNCTION inventory_movements_protect() RETURNS trigger AS $$
BEGIN
  IF current_setting('erp.allow_movement_changes', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Los movimientos de inventario confirmados no se editan ni se eliminan; registre una reversion o un ajuste'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movements_immutable
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_protect();
