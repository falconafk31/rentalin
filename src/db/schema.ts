import { pgTable, uuid, text, timestamp, integer, numeric, date, boolean, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
export const profiles = pgTable('profiles', {
 id: uuid('id').primaryKey(), fullName: text('full_name').notNull(), role: text('role').notNull(), createdAt: createdAt(),
});
export const clients = pgTable('clients', {
 id: uuid('id').defaultRandom().primaryKey(), companyName: text('company_name').notNull(), npwp: text('npwp'), address: text('address'), picName: text('pic_name').notNull(), picPhone: text('pic_phone'), picEmail: text('pic_email'), createdAt: createdAt(),
});
export const fleet = pgTable('fleet', {
 id: uuid('id').defaultRandom().primaryKey(), unitCode: text('unit_code').notNull().unique(), category: text('category').notNull(), brandModel: text('brand_model').notNull(), year: integer('year'), status: text('status').default('available').notNull(), currentLocation: text('current_location'), sikoExpiry: date('siko_expiry'), insuranceExpiry: date('insurance_expiry'), hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }).notNull(), createdAt: createdAt(),
});
export const contracts = pgTable('contracts', {
 id: uuid('id').defaultRandom().primaryKey(), contractNumber: text('contract_number').notNull().unique(), clientId: uuid('client_id').references(() => clients.id, { onDelete: 'restrict' }).notNull(), unitId: uuid('unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), startDate: date('start_date').notNull(), endDate: date('end_date').notNull(), ratePerHour: numeric('rate_per_hour', { precision: 12, scale: 2 }).notNull(), status: text('status').default('draft').notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex('one_active_contract_per_unit').on(t.unitId).where(sql`${t.status} = 'active'`),check('contract_dates',sql`${t.endDate} >= ${t.startDate}`)]);
export const contractRevisions = pgTable('contract_revisions', {
 id: uuid('id').defaultRandom().primaryKey(), contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(), revisionNumber: integer('revision_number').notNull(), reason: text('reason').notNull(), changedBy: uuid('changed_by').references(() => profiles.id), prevStartDate: date('prev_start_date').notNull(), newStartDate: date('new_start_date').notNull(), prevEndDate: date('prev_end_date').notNull(), newEndDate: date('new_end_date').notNull(), prevRate: numeric('prev_rate', { precision: 12, scale: 2 }).notNull(), newRate: numeric('new_rate', { precision: 12, scale: 2 }).notNull(), prevUnitId: uuid('prev_unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), newUnitId: uuid('new_unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), createdAt: createdAt(),
});
export const invoices = pgTable('invoices', {
 id: uuid('id').defaultRandom().primaryKey(), invoiceNumber: text('invoice_number').notNull().unique(), contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'restrict' }).notNull(), subtotalAmount: numeric('subtotal_amount', { precision: 15, scale: 2 }).notNull(), totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(), taxAmount: numeric('tax_amount', { precision: 15, scale: 2 }).notNull(), taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull(), status: text('status').default('unpaid').notNull(), issueDate: date('issue_date').notNull(), dueDate: date('due_date').notNull(), createdAt: createdAt(),
});
export const timesheets = pgTable('timesheets', {
 id: uuid('id').defaultRandom().primaryKey(), contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(), unitId: uuid('unit_id').references(() => fleet.id, { onDelete: 'restrict' }).notNull(), operatorId: uuid('operator_id').references(() => profiles.id).notNull(), date: date('date').notNull(), startHm: numeric('start_hm', { precision: 10, scale: 2 }).notNull(), endHm: numeric('end_hm', { precision: 10, scale: 2 }).notNull(), totalHours: numeric('total_hours', { precision: 5, scale: 2 }).generatedAlwaysAs(sql`end_hm - start_hm`), breakdownHours: numeric('breakdown_hours', { precision: 5, scale: 2 }).default('0').notNull(), effectiveHours: numeric('effective_hours', { precision: 5, scale: 2 }).generatedAlwaysAs(sql`end_hm - start_hm - breakdown_hours`), notes: text('notes'), status: text('status').default('pending').notNull(), invoiceId: uuid('invoice_id').references(() => invoices.id), createdAt: createdAt(),
}, (t) => [uniqueIndex('one_daily_log_per_contract').on(t.contractId,t.date),check('valid_meter_hours',sql`${t.startHm} >= 0 AND ${t.endHm} >= ${t.startHm} AND ${t.breakdownHours} >= 0 AND ${t.breakdownHours} <= ${t.endHm} - ${t.startHm}`)]);
export const handovers = pgTable('handovers', {
 id: uuid('id').defaultRandom().primaryKey(), documentNumber: text('document_number').notNull().unique(), contractId: uuid('contract_id').references(() => contracts.id).notNull(), type: text('type').notNull(), date: date('date').notNull(), engine: boolean('engine').notNull(), hydraulics: boolean('hydraulics').notNull(), tracks: boolean('tracks').notNull(), oil: boolean('oil').notNull().default(true), fuel: boolean('fuel').notNull().default(true), battery: boolean('battery').notNull().default(true), lights: boolean('lights').notNull().default(true), brakes: boolean('brakes').notNull().default(true), bucket: boolean('bucket').notNull().default(true), cabin: boolean('cabin').notNull().default(true), safety: boolean('safety').notNull().default(true), documents: boolean('documents').notNull().default(true), notes: text('notes'), photoUrls: text('photo_urls').array().notNull().default(sql`'{}'`), createdAt: createdAt(),
});
export const companySettings = pgTable('company_settings', {
 id: text('id').primaryKey().default('main'), companyName: text('company_name').notNull().default('PT Penyewaan Alat Berat'), address: text('address').notNull().default('Jakarta, Indonesia'), email: text('email').notNull().default('operasional@heavyops.id'), phone: text('phone').notNull().default('+62 21 555 0128'), signerName: text('signer_name').notNull().default(''), signerTitle: text('signer_title').notNull().default(''), ppnRate: numeric('ppn_rate', { precision: 5, scale: 2 }).notNull().default('11'), expiryWarningDays: integer('expiry_warning_days').notNull().default(30),
 // Lokalisasi dokumen: kota penandatanganan (baris "Kota, tanggal" di PDF)
 // dan zona waktu kalender (WIB/WITA/WIT) untuk "hari ini" badge & validasi.
 city: text('city').notNull().default('Jakarta'), timezone: text('timezone').notNull().default('WIB'),
});
export const payments = pgTable('payments', {
 id: uuid('id').defaultRandom().primaryKey(), invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'restrict' }).notNull(), amount: numeric('amount', { precision: 15, scale: 2 }).notNull(), method: text('method').notNull(), reference: text('reference'), notes: text('notes'), paidAt: date('paid_at').notNull(), notedBy: uuid('noted_by').references(() => profiles.id), createdAt: createdAt(),
});
export const auditLog = pgTable('audit_log', {
 id: uuid('id').defaultRandom().primaryKey(), actorId: uuid('actor_id'), actorName: text('actor_name').notNull().default('Sistem'), action: text('action').notNull(), entity: text('entity').notNull(), entityId: text('entity_id'), summary: text('summary').notNull(), beforeData: jsonb('before_data').$type<unknown>(), afterData: jsonb('after_data').$type<unknown>(), createdAt: createdAt(),
});
