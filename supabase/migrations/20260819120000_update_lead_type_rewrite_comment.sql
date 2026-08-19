-- Обновляет комментарий к leads.enneagram_type — правило записи типа
-- изменилось (см. src/lib/leads/type-assignment.ts): побеждает не самая
-- уверенная, а последняя по времени завершённая попытка. Данные не меняются,
-- только документация схемы.

COMMENT ON COLUMN public.leads.enneagram_type IS
  'Перезаписывается результатом последнего завершённого прохождения теста (не confidence — отступление от Чертежа, см. src/lib/leads/type-assignment.ts).';
