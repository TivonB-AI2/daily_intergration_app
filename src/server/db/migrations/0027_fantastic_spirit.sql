CREATE INDEX "brand_assets_storage_file_id_idx" ON "brand_assets" USING btree ("storage_file_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "content_calendar_items_storage_file_id_idx" ON "content_calendar_items" USING btree ("storage_file_id");--> statement-breakpoint
CREATE INDEX "csv_import_rows_batch_id_idx" ON "csv_import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "data_exports_storage_file_id_idx" ON "data_exports" USING btree ("storage_file_id");--> statement-breakpoint
CREATE INDEX "document_jobs_storage_file_id_idx" ON "document_jobs" USING btree ("storage_file_id");--> statement-breakpoint
CREATE INDEX "document_jobs_pipeline_config_id_idx" ON "document_jobs" USING btree ("pipeline_config_id");--> statement-breakpoint
CREATE INDEX "pipeline_stage_results_job_id_idx" ON "pipeline_stage_results" USING btree ("job_id");