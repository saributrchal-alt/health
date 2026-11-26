create table if not exists health_kiosk_weights (
  reading_id char(36) character set ascii collate ascii_bin primary key,
  member_id char(36) character set ascii collate ascii_bin not null,
  device_id char(36) character set ascii collate ascii_bin not null,
  weight_hundredths smallint unsigned not null,
  measured_at_utc datetime(6) not null,
  constraint health_kiosk_weight_range check (weight_hundredths between 500 and 30000),
  index health_kiosk_weights_member_idx (member_id, measured_at_utc)
) engine=InnoDB;
