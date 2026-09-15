import { pgTable, uuid, text, timestamp, integer, numeric, date, boolean, jsonb, bigint, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
export const profiles = pgTable('profiles', {
 id: uuid('id').primaryKey(), fullName: text('full_name').notNull(), role: text('role').notNull(), createdAt: createdAt(),
});
export const clients = pgTable('clients', {
 id: uuid('id').defaultRandom().primaryKey(), companyName: text('company_name').notNull(), npwp: text('npwp'), address: text('address'), picName: text('pic_name').notNull(), picKtp: text('pic_ktp'), picPhone: text('pic_phone'), picEmail: text('pic_email'), createdAt: createdAt(),
}, (t) => [index('clients_company_name_idx').on(t.companyName), index('clients_created_at_idx').on(t.createdAt)]);
export const fleet = pgTable('fleet', {
 id: uuid('id').defaultRandom().primaryKey(), unitCode: text('unit_code').notNull().unique(), category: text('category').notNull(), brandModel: text('brand_model').notNull(), year: integer('year'), status: text('status').default('available').notNull(), currentLocation: text('current_location'), sikoExpiry: date('siko_expiry'), insuranceExpiry: date('insurance_expiry'), hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }).notNull(), createdAt: createdAt(),
}, (t) => [index('fleet_status_idx').on(t.status), index('fleet_created_at_idx').on(t.createdAt)]);
export const contracts = pgTable('contracts', {
 id: uuid('id').defaultRandom().primaryKey(), contractNumber: text('contract_number').notNull().unique(), clientId: uuid('client_id').references(() => clients.id, { onDelete: 'restrict' }).notNull(), unitId: uuid('unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), startDate: date('start_date').notNull(), endDate: date('end_date').notNull(), ratePerHour: numeric('rate_per_hour', { precision: 12, scale: 2 }).notNull(), status: text('status').default('draft').notNull(), includeOperator: boolean('include_operator').notNull().default(false), operatorRate: numeric('operator_rate', { precision: 12, scale: 2 }), operatorRateType: text('operator_rate_type'), createdAt: createdAt(),
}, (t) => [uniqueIndex('one_active_contract_per_unit').on(t.unitId).where(sql`${t.status} = 'active'`),check('contract_dates',sql`${t.endDate} >= ${t.startDate}`),index('contracts_client_id_idx').on(t.clientId),index('contracts_status_idx').on(t.status),index('contracts_created_at_idx').on(t.createdAt)]);
export const contractRevisions = pgTable('contract_revisions', {
 id: uuid('id').defaultRandom().primaryKey(), contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(), revisionNumber: integer('revision_number').notNull(), reason: text('reason').notNull(), changedBy: uuid('changed_by').references(() => profiles.id), prevStartDate: date('prev_start_date').notNull(), newStartDate: date('new_start_date').notNull(), prevEndDate: date('prev_end_date').notNull(), newEndDate: date('new_end_date').notNull(), prevRate: numeric('prev_rate', { precision: 12, scale: 2 }).notNull(), newRate: numeric('new_rate', { precision: 12, scale: 2 }).notNull(), prevUnitId: uuid('prev_unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), newUnitId: uuid('new_unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), createdAt: createdAt(),
});
export const invoices = pgTable('invoices', {
 id: uuid('id').defaultRandom().primaryKey(), invoiceNumber: text('invoice_number').notNull().unique(), contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'restrict' }).notNull(), subtotalAmount: numeric('subtotal_amount', { precision: 15, scale: 2 }).notNull(), totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(), taxAmount: numeric('tax_amount', { precision: 15, scale: 2 }).notNull(), taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull(), operatorAmount: numeric('operator_amount', { precision: 15, scale: 2 }).notNull().default('0'), status: text('status').default('unpaid').notNull(), issueDate: date('issue_date').notNull(), dueDate: date('due_date').notNull(), createdAt: createdAt(),
}, (t) => [index('invoices_contract_id_idx').on(t.contractId),index('invoices_status_idx').on(t.status),index('invoices_issue_date_idx').on(t.issueDate),index('invoices_due_date_idx').on(t.dueDate)]);
export const timesheets = pgTable('timesheets', {
 id: uuid('id').defaultRandom().primaryKey(), contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(), unitId: uuid('unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), operatorId: uuid('operator_id').references(() => profiles.id).notNull(), operatorDriverId: uuid('operator_driver_id').references(() => operators.id, { onDelete: 'set null' }), date: date('date').notNull(), startHm: numeric('start_hm', { precision: 10, scale: 2 }).notNull(), endHm: numeric('end_hm', { precision: 10, scale: 2 }).notNull(), totalHours: numeric('total_hours', { precision: 5, scale: 2 }).generatedAlwaysAs(sql`end_hm - start_hm`), breakdownHours: numeric('breakdown_hours', { precision: 5, scale: 2 }).default('0').notNull(), effectiveHours: numeric('effective_hours', { precision: 5, scale: 2 }).generatedAlwaysAs(sql`end_hm - start_hm - breakdown_hours`), notes: text('notes'), status: text('status').default('pending').notNull(), invoiceId: uuid('invoice_id').references(() => invoices.id), billingRateSnapshot: numeric('billing_rate_snapshot', { precision: 12, scale: 2 }), operatorRateSnapshot: numeric('operator_rate_snapshot', { precision: 12, scale: 2 }), operatorRateTypeSnapshot: text('operator_rate_type_snapshot'), createdAt: createdAt(),
}, (t) => [uniqueIndex('one_daily_log_per_contract').on(t.contractId,t.date),check('valid_meter_hours',sql`${t.startHm} >= 0 AND ${t.endHm} >= ${t.startHm} AND ${t.breakdownHours} >= 0 AND ${t.breakdownHours} <= ${t.endHm} - ${t.startHm}`),index('timesheets_operator_id_idx').on(t.operatorId),index('timesheets_invoice_id_idx').on(t.invoiceId),index('timesheets_date_idx').on(t.date),index('timesheets_operator_driver_id_idx').on(t.operatorDriverId),index('timesheets_unit_id_idx').on(t.unitId)]);
export const handovers = pgTable('handovers', {
 id: uuid('id').defaultRandom().primaryKey(), documentNumber: text('document_number').notNull().unique(), contractId: uuid('contract_id').references(() => contracts.id).notNull(), type: text('type').notNull(), date: date('date').notNull(), engine: boolean('engine').notNull(), hydraulics: boolean('hydraulics').notNull(), tracks: boolean('tracks').notNull(), oil: boolean('oil').notNull().default(true), fuel: boolean('fuel').notNull().default(true), battery: boolean('battery').notNull().default(true), lights: boolean('lights').notNull().default(true), brakes: boolean('brakes').notNull().default(true), bucket: boolean('bucket').notNull().default(true), cabin: boolean('cabin').notNull().default(true), safety: boolean('safety').notNull().default(true), documents: boolean('documents').notNull().default(true), notes: text('notes'), photoUrls: text('photo_urls').array().notNull().default(sql`'{}'`), createdAt: createdAt(),
}, (t) => [index('handovers_contract_id_idx').on(t.contractId),index('handovers_date_idx').on(t.date),uniqueIndex('handovers_contract_type_unique').on(t.contractId, t.type)]);
export const companySettings = pgTable('company_settings', {
 id: text('id').primaryKey().default('main'), companyName: text('company_name').notNull().default('PT Penyewaan Alat Berat'), address: text('address').notNull().default('Jakarta, Indonesia'), email: text('email').notNull().default('operasional@heavyops.id'), phone: text('phone').notNull().default('+62 21 555 0128'), signerName: text('signer_name').notNull().default(''), signerTitle: text('signer_title').notNull().default(''), ppnRate: numeric('ppn_rate', { precision: 5, scale: 2 }).notNull().default('11'), expiryWarningDays: integer('expiry_warning_days').notNull().default(30),
 // Lokalisasi dokumen: kota penandatanganan (baris "Kota, tanggal" di PDF)
 // dan zona waktu kalender (WIB/WITA/WIT) untuk "hari ini" badge & validasi.
 city: text('city').notNull().default('Jakarta'), timezone: text('timezone').notNull().default('WIB'),
 // Data pembayaran & identitas dokumen (PASAL 3 perjanjian, info bayar invoice):
 npwp: text('npwp').notNull().default(''), signerKtp: text('signer_ktp').notNull().default(''),
 bankName: text('bank_name').notNull().default(''), bankAccountName: text('bank_account_name').notNull().default(''), bankAccountNumber: text('bank_account_number').notNull().default(''),
});
export const payments = pgTable('payments', {
 id: uuid('id').defaultRandom().primaryKey(), invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'restrict' }).notNull(), amount: numeric('amount', { precision: 15, scale: 2 }).notNull(), method: text('method').notNull(), reference: text('reference'), notes: text('notes'), paidAt: date('paid_at').notNull(), notedBy: uuid('noted_by').references(() => profiles.id), createdAt: createdAt(),
}, (t) => [index('payments_invoice_id_idx').on(t.invoiceId)]);
export const documentTemplates = pgTable('document_templates', {
 id: uuid('id').defaultRandom().primaryKey(), kind: text('kind').notNull(), version: integer('version').notNull(), status: text('status').notNull().default('draft'), title: text('title').notNull().default(''), content: jsonb('content').notNull().default({}), variables: text('variables').array().notNull().default(sql`'{}'`), updatedBy: uuid('updated_by').references(() => profiles.id), createdAt: createdAt(), publishedAt: timestamp('published_at', { withTimezone: true }),
}, (t) => [index('doc_templates_kind_status_idx').on(t.kind, t.status)]);
export const auditLog = pgTable('audit_log', {
 id: uuid('id').defaultRandom().primaryKey(), actorId: uuid('actor_id'), actorName: text('actor_name').notNull().default('Sistem'), action: text('action').notNull(), entity: text('entity').notNull(), entityId: text('entity_id'), summary: text('summary').notNull(), beforeData: jsonb('before_data').$type<unknown>(), afterData: jsonb('after_data').$type<unknown>(), createdAt: createdAt(),
});
// Media layer (docs/media-architecture.md): metadata foto fleet; binary di
// Cloudflare R2, object_key = `{entity_type}/{entity_id}/{category}/{id}.{ext}`.
// entity_id tanpa FK (kolom diskriminan lintas entitas); status lifecycle
// pending→active / failed / deleted (orphan cleanup lewat idx status).
export const mediaFiles = pgTable('media_files', {
 id: uuid('id').defaultRandom().primaryKey(), entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(), category: text('category').notNull(), objectKey: text('object_key').notNull().unique(), mimeType: text('mime_type').notNull(), sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(), width: integer('width'), height: integer('height'), originalName: text('original_name'), status: text('status').notNull().default('pending'), createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }), createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('idx_media_files_entity').on(t.entityType, t.entityId, t.category), index('idx_media_files_status').on(t.status, t.createdAt)]);
// ---------------------------------------------------------------------------
// Operator/Driver (docs/plan-operator-dan-riwayat-armada.md PR-1): registri
// personel terpisah dari `profiles` (akun). Tarif DUA mode (per jam / per
// hari); SIO/SIM = PII dengan kedaluwarsa (warning 30 hari, pola SIKO fleet).
// ---------------------------------------------------------------------------
export const operators = pgTable('operators', {
 id: uuid('id').defaultRandom().primaryKey(), fullName: text('full_name').notNull(), employeeNo: text('employee_no').unique(), ktpNo: text('ktp_no'), phone: text('phone'), sioClass: text('sio_class'), sioNumber: text('sio_number'), sioExpiry: date('sio_expiry'), licenseClass: text('license_class'), licenseExpiry: date('license_expiry'),
 ratePerHour: numeric('rate_per_hour', { precision: 12, scale: 2 }).notNull().default('0'), ratePerDay: numeric('rate_per_day', { precision: 12, scale: 2 }).notNull().default('0'),
 defaultRateType: text('default_rate_type').notNull().default('hourly'), status: text('status').notNull().default('active'), notes: text('notes'),
 profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }), createdAt: createdAt(),
}, (t) => [index('operators_status_idx').on(t.status), index('operators_name_idx').on(t.fullName), index('operators_sio_expiry_idx').on(t.sioExpiry)]);
// Assignment operator ke kontrak (wet hire, multi-operator utk shift/rotasi).
export const contractOperators = pgTable('contract_operators', {
 contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(), operatorId: uuid('operator_id').references(() => operators.id, { onDelete: 'cascade' }).notNull(), assignedAt: createdAt(),
}, (t) => [index('contract_operators_operator_idx').on(t.operatorId)]);
