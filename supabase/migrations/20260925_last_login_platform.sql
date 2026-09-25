alter table profiles
  add column if not exists last_login_platform text; -- 'web' | 'ios' | 'android'
