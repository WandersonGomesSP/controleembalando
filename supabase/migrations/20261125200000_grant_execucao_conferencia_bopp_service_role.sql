-- O processo administrativo de edição de bobinas usa service_role e dispara o trigger de conferência.
-- Mantém SECURITY INVOKER e concede apenas EXECUTE à role interna do servidor.
grant execute on function estoque_atual.conferir_baixa_bopp_virgem_por_codigo(text) to service_role;
