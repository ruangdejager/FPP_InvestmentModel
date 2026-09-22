CREATE TABLE `actuals` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`gross_booking_revenue` integer DEFAULT 0 NOT NULL,
	`nights_sold` real,
	`turnovers` real,
	`platform_fees` integer DEFAULT 0 NOT NULL,
	`management_fees` integer DEFAULT 0 NOT NULL,
	`cleaning` integer DEFAULT 0 NOT NULL,
	`levies` integer DEFAULT 0 NOT NULL,
	`municipal_rates` integer DEFAULT 0 NOT NULL,
	`utilities` integer DEFAULT 0 NOT NULL,
	`maintenance` integer DEFAULT 0 NOT NULL,
	`other` integer DEFAULT 0 NOT NULL,
	`bond_payment` integer DEFAULT 0 NOT NULL,
	`bond_interest` integer DEFAULT 0 NOT NULL,
	`bond_balance` integer,
	`notes` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actuals_property_period` ON `actuals` (`property_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `assumption_history` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` real NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`source` text,
	`note` text,
	`changed_by` text,
	`changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assumption_history_key_idx` ON `assumption_history` (`key`);--> statement-breakpoint
CREATE TABLE `assumptions` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`effective_from` text NOT NULL,
	`source` text,
	`verified` integer DEFAULT false NOT NULL,
	`verified_date` text,
	`notes` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comparables` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`scheme_name` text,
	`address` text,
	`asset_type` text,
	`bedrooms` integer,
	`floor_area_m2` real,
	`transaction_date` text,
	`price` integer,
	`price_per_m2` integer,
	`adr` integer,
	`occupancy` real,
	`annual_gross` integer,
	`revenue_period` text,
	`observation_year` integer,
	`evidence_url` text,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`excluded_from_benchmarks` integer DEFAULT false NOT NULL,
	`exclusion_reason` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comparables_scheme_idx` ON `comparables` (`scheme_name`);--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text,
	`director_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`director_id`) REFERENCES `directors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contributions_director_idx` ON `contributions` (`director_id`);--> statement-breakpoint
CREATE TABLE `cost_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`basis` text NOT NULL,
	`rate` real,
	`amount` integer,
	`escalation_pct` real DEFAULT 0 NOT NULL,
	`vat_input_claimable` integer DEFAULT false NOT NULL,
	`evidenced` integer DEFAULT false NOT NULL,
	`evidence_note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`strategy` text DEFAULT 'str' NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cost_lines_scenario_idx` ON `cost_lines` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `directors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`share_pct` real DEFAULT 0.2 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `directors_email_unique` ON `directors` (`email`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text,
	`original_filename` text NOT NULL,
	`stored_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text,
	`uploaded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_owner_idx` ON `documents` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `fee_scales` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`effective_from` text NOT NULL,
	`lower` integer NOT NULL,
	`upper` integer,
	`base_amount` integer NOT NULL,
	`marginal_rate` real NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE INDEX `fee_scales_kind_idx` ON `fee_scales` (`kind`,`effective_from`);--> statement-breakpoint
CREATE TABLE `group_settings` (
	`id` text PRIMARY KEY DEFAULT 'group' NOT NULL,
	`vat_registered` integer DEFAULT false NOT NULL,
	`vat_registered_from_date` text,
	`vat_pricing_mode` text DEFAULT 'absorbed' NOT NULL,
	`monthly_capacity` integer DEFAULT 0 NOT NULL,
	`growth_band_low` real DEFAULT 0.05 NOT NULL,
	`growth_band_high` real DEFAULT 0.08 NOT NULL,
	`growth_band_source` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `growth_assumptions` (
	`scenario_id` text PRIMARY KEY NOT NULL,
	`capital_growth_pct` real NOT NULL,
	`capital_growth_per_year` text,
	`revenue_escalation_pct` real NOT NULL,
	`evidenced` integer DEFAULT false NOT NULL,
	`evidence_note` text,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `maintenance_log` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`category` text,
	`is_special_levy` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_property_idx` ON `maintenance_log` (`property_id`);--> statement-breakpoint
CREATE TABLE `one_off_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`label` text NOT NULL,
	`month_index` integer NOT NULL,
	`amount` integer NOT NULL,
	`recurring_every_months` integer,
	`vat_input_claimable` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `one_off_costs_scenario_idx` ON `one_off_costs` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`name` text NOT NULL,
	`street_address` text,
	`suburb` text,
	`scheme_name` text,
	`unit_number` text,
	`asset_type` text DEFAULT 'apt_1bed' NOT NULL,
	`bedrooms` integer,
	`bathrooms` real,
	`floor_area_m2` real,
	`parking_bays` integer,
	`purchase_price` integer NOT NULL,
	`listing_url` text,
	`agent_contact` text,
	`date_added` text NOT NULL,
	`transfer_date` text,
	`notes` text,
	`str_permitted` text DEFAULT 'unknown' NOT NULL,
	`str_rules_checked_date` text,
	`str_rules_document_id` text,
	`str_restriction_notes` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `properties_status_idx` ON `properties` (`status`);--> statement-breakpoint
CREATE TABLE `property_comparables` (
	`property_id` text NOT NULL,
	`comparable_id` text NOT NULL,
	PRIMARY KEY(`property_id`, `comparable_id`),
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comparable_id`) REFERENCES `comparables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_path` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`from_month` integer NOT NULL,
	`prime_rate` real NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_path_scenario_month` ON `rate_path` (`scenario_id`,`from_month`);--> statement-breakpoint
CREATE TABLE `refinance_policy` (
	`scenario_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`target_ltv` real DEFAULT 0.8 NOT NULL,
	`min_months_between` integer DEFAULT 24 NOT NULL,
	`min_release` integer DEFAULT 0 NOT NULL,
	`recost_pct` real DEFAULT 0.015 NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `revenue_benchmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_type` text NOT NULL,
	`label` text NOT NULL,
	`unit_years` integer,
	`median_annual_gross` integer NOT NULL,
	`low_annual_gross` integer,
	`high_annual_gross` integer,
	`observation_year` integer NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`source` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `scenario_finance` (
	`scenario_id` text PRIMARY KEY NOT NULL,
	`deposit_pct` real NOT NULL,
	`bond_term_months` integer NOT NULL,
	`rate_basis` text DEFAULT 'prime_linked' NOT NULL,
	`rate_margin` real DEFAULT -0.01 NOT NULL,
	`fixed_rate` real,
	`transfer_duty_applies` integer DEFAULT true NOT NULL,
	`vat_inclusive_purchase` integer DEFAULT false NOT NULL,
	`furnishing_cost` integer DEFAULT 0 NOT NULL,
	`other_setup_costs` integer DEFAULT 0 NOT NULL,
	`projection_months` integer DEFAULT 240 NOT NULL,
	`surplus_reinvestment_rate` real DEFAULT 0.1 NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scenario_revenue` (
	`scenario_id` text PRIMARY KEY NOT NULL,
	`strategy` text DEFAULT 'str' NOT NULL,
	`revenue_mode` text DEFAULT 'annual_gross' NOT NULL,
	`annual_gross` integer DEFAULT 0 NOT NULL,
	`turnover_mode` text DEFAULT 'occupancy_los' NOT NULL,
	`ltr_monthly_rent` integer DEFAULT 0 NOT NULL,
	`ltr_lease_months` integer DEFAULT 11 NOT NULL,
	`ltr_vacant_months` text DEFAULT '[12]' NOT NULL,
	`evidence_note` text,
	`evidenced` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenarios_property_idx` ON `scenarios` (`property_id`);--> statement-breakpoint
CREATE TABLE `seasonality` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`month_of_year` integer NOT NULL,
	`strategy` text DEFAULT 'str' NOT NULL,
	`season_index` real DEFAULT 1 NOT NULL,
	`adr` integer,
	`occupancy` real,
	`avg_los` real,
	`turnovers` real,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasonality_scenario_month` ON `seasonality` (`scenario_id`,`strategy`,`month_of_year`);--> statement-breakpoint
CREATE TABLE `seasonality_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`monthly_index` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`source` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`director_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`director_id`) REFERENCES `directors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_director_idx` ON `sessions` (`director_id`);--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`source` text,
	`notes` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `valuations_property_idx` ON `valuations` (`property_id`);