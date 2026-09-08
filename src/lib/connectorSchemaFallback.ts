/**
 * Cached schema snapshots for data-source connectors whose tables/streams
 * can't be introspected live through `querySource` (a SQL-only query
 * interface) — either because the connector isn't a SQL engine at all
 * (Salesforce, Odoo, OneDrive, SFTP, Qdrant, Pinecone, ...) or because its
 * live connection currently errors for environment reasons (missing ODBC
 * driver, platform request failures, a pagination incompatibility).
 *
 * Snapshots were captured using the platform's connector-discovery catalog
 * (the same "discover" capability used by the Connectors page's schema
 * browser) against the real connectors configured in this workspace. This
 * is inherently a point-in-time cache, not a live query — the Insights page
 * clearly labels tables sourced from here, and doesn't attempt to run a
 * SQL query against them (since that would just fail for these connector
 * types).
 *
 * Keyed by connector id (as configured in this specific workspace). If a
 * newly-added connector or workspace isn't in this map, the Insights page
 * simply reports that no schema is available yet for it.
 */
export type FallbackTable = {
  name: string;
  columns: string[];
};

export type FallbackConnectorSchema = {
  tables: FallbackTable[];
  /** Short note shown in the UI explaining why this is cached, not live. */
  note: string;
};

export const CONNECTOR_SCHEMA_FALLBACK: Record<
  string,
  FallbackConnectorSchema
> = {
  // QuickBooks — object-based API, not SQL.
  "1212": {
    note: "QuickBooks isn't a SQL engine, so this is a cached snapshot from the connector's discovery catalog rather than a live query.",
    tables: [
      {
        name: "Account",
        columns: [
          "Id",
          "Name",
          "Active",
          "AccountType",
          "AccountSubType",
          "Classification",
          "CurrentBalance",
          "CurrencyRef",
          "FullyQualifiedName",
        ],
      },
      {
        name: "Customer",
        columns: [
          "Id",
          "DisplayName",
          "CompanyName",
          "GivenName",
          "FamilyName",
          "Active",
          "Balance",
          "PrimaryEmailAddr",
          "PrimaryPhone",
          "BillAddr",
        ],
      },
      {
        name: "Employee",
        columns: [
          "Id",
          "DisplayName",
          "GivenName",
          "FamilyName",
          "Active",
          "BillableTime",
        ],
      },
      {
        name: "Invoice",
        columns: [
          "Id",
          "DocNumber",
          "TxnDate",
          "DueDate",
          "TotalAmt",
          "Balance",
          "CustomerRef",
          "CurrencyRef",
          "EmailStatus",
          "PrintStatus",
        ],
      },
      {
        name: "TimeActivity",
        columns: [
          "Id",
          "TxnDate",
          "Hours",
          "Minutes",
          "EmployeeRef",
          "CustomerRef",
          "Description",
          "BillableStatus",
          "HourlyRate",
        ],
      },
    ],
  },
  // SFTP — flat CSV files, not SQL.
  "1160": {
    note: "SFTP file sources aren't SQL engines, so this is a cached snapshot of the file's columns from the connector's discovery catalog.",
    tables: [
      {
        name: "Book_test_PC_20260331-155345.csv",
        columns: ["col1", "col2", "col3"],
      },
    ],
  },
  // OneDrive — structured Excel files.
  "2267": {
    note: "OneDrive isn't a SQL engine, so this is a cached snapshot of each file's columns from the connector's discovery catalog.",
    tables: [
      { name: "Booklet.xlsx", columns: ["Col1", "Col2", "Col3"] },
      { name: "Random_Book.xlsx", columns: ["Code", "Name", "Value"] },
      { name: "Next/Book.xlsx", columns: ["Book", "code"] },
      {
        name: "Next/Sample_Book.xlsx",
        columns: [
          "Date",
          "Item",
          "Category",
          "Decimal Amount",
          "Doubled Amount",
        ],
      },
    ],
  },
  // OneDrive — unstructured documents.
  "1977": {
    note: "OneDrive (unstructured) isn't a SQL engine, so this is a cached snapshot from the connector's discovery catalog.",
    tables: [
      {
        name: "unstructured",
        columns: [
          "element_id",
          "text",
          "filename",
          "filetype",
          "created_date",
          "modified_date",
        ],
      },
    ],
  },
  // Databricks — live SQL discovery currently fails in this workspace
  // (platform request error), so this is a cached fallback of the same data.
  "1233": {
    note: "Live schema discovery currently fails for this connector (a platform request error), so this is a cached snapshot from the connector's discovery catalog instead.",
    tables: [
      {
        name: "contacts",
        columns: [
          "id",
          "name",
          "type",
          "email",
          "notes",
          "owner",
          "stage",
          "last_activity_days_ago",
        ],
      },
      {
        name: "opportunities",
        columns: [
          "id",
          "name",
          "owner",
          "stage",
          "amount",
          "status",
          "close_date",
          "contact_name",
        ],
      },
      {
        name: "products",
        columns: ["id", "name", "ticker", "min_aum", "category", "description"],
      },
    ],
  },
  // AWS Athena — live discovery currently fails (platform pagination
  // incompatibility with this engine), so fall back to the cached catalog.
  "1205": {
    note: "Live schema discovery currently fails for this connector (a pagination incompatibility with this engine), so this is a cached snapshot from the connector's discovery catalog instead.",
    tables: [
      { name: "table_name", columns: ["column_name"] },
      { name: "test_table", columns: ["col1", "col2", "col3"] },
    ],
  },
  // Salesforce, Qdrant, Pinecone — discovery succeeds but no streams are
  // currently configured on these connectors in this workspace.
  "1402": {
    note: "This connector's discovery catalog currently has no streams configured.",
    tables: [],
  },
  "1213": {
    note: "This connector's discovery catalog currently has no streams configured.",
    tables: [],
  },
  "1144": {
    note: "This connector's discovery catalog currently has no streams configured.",
    tables: [],
  },
  // Odoo — exposes its entire internal model catalog (250+ objects) as
  // streams; only the most business-relevant ones are cached here to keep
  // this snapshot useful rather than an unreadable wall of internal models.
  "1390": {
    note: "Odoo isn't a SQL engine and exposes 250+ internal objects — this is a cached snapshot of the most business-relevant ones from the connector's discovery catalog.",
    tables: [
      {
        name: "res.partner",
        columns: ["id", "name", "email", "phone", "city", "zip", "vat", "lang"],
      },
      {
        name: "crm.lead",
        columns: ["id", "name", "type", "phone", "street", "city", "tag_ids"],
      },
      {
        name: "crm.team",
        columns: ["id", "name", "user_id", "use_leads", "sequence"],
      },
      {
        name: "project.project",
        columns: ["id", "name", "date", "tasks", "user_id", "task_ids"],
      },
      {
        name: "project.task",
        columns: ["id", "name", "state", "date_end", "priority", "stage_id"],
      },
      {
        name: "hr.employee",
        columns: ["id", "name", "email", "phone", "job_id", "wage", "active"],
      },
      {
        name: "hr.department",
        columns: ["id", "name", "child_ids", "parent_id", "company_id"],
      },
      {
        name: "account.analytic.line",
        columns: ["id", "date", "name", "amount", "account_id", "partner_id"],
      },
      {
        name: "calendar.event",
        columns: ["id", "name", "stop", "day", "mon", "tue", "wed"],
      },
      {
        name: "res.users",
        columns: ["id", "name", "lang", "city", "zip", "role"],
      },
      {
        name: "res.company",
        columns: ["id", "name", "email", "phone", "logo", "currency_id"],
      },
    ],
  },
};
