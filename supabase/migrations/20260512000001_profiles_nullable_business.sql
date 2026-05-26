-- super_admin profiles have no business_id (they manage all businesses)
alter table profiles
  alter column business_id drop not null;
