-- Add owner/contact column to businesses
-- Stores the person who signed the contract: name, phone, sex, city, business location
alter table businesses add column owner jsonb;
