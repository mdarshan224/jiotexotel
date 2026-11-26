-- Before this release, all Exotel fetches were rejected locally by the Worker
-- because redirect:error is unsupported. No provider request could be sent.
-- Release only the resulting unconfirmed attempts with no provider SID.
-- Any attempt that has a provider SID is preserved. This never initiates a call.
UPDATE `SupportCall` SET `status` = 'FAILED', `updatedAt` = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE `status` = 'UNKNOWN' AND `gatewaySid` IS NULL;
--> statement-breakpoint
UPDATE `VoiceCall` SET `status` = 'FAILED', `updatedAt` = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE `status` = 'UNKNOWN' AND `gatewaySid` IS NULL;
