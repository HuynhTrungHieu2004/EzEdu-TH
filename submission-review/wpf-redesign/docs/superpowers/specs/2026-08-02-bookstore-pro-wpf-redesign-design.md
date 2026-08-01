# Bookstore Pro WPF Redesign — Design Specification

**Status:** Approved design; pending written-spec review  
**Date:** 2026-08-02  
**Student team:** Huỳnh Trung Hiếu (221A011106), Nguyễn Thị Minh Ánh (221A370840)  
**Course:** Lập trình trên Windows — lớp 253INT441901  
**Selected direction:** WPF rewrite, Executive Navy visual language, A1 Split POS sales layout

## 1. Context

The submitted baseline is a WinForms bookstore-management application targeting
.NET Core 3.1 with SQL Server. It covers basic catalog, inventory, invoice, and
reporting screens, but it contains machine-specific configuration, string-built
SQL, plaintext passwords, non-transactional sales, collision-prone random codes,
inconsistent stock rules, and a report that describes features not present in
the product.

The student team has permission to inherit the baseline. The redesign will
credit that foundation and clearly separate inherited concepts from the new
implementation. The old application is a requirements reference only; the
deliverable is a new WPF solution.

## 2. Goals

- Deliver a coherent Windows desktop bookstore system that builds and runs on a
  clean Windows 10 or Windows 11 x64 machine.
- Demonstrate WPF, MVVM, object-oriented design, dependency injection, EF Core,
  SQL Server transactions, authentication, authorization, validation, testing,
  and professional document preparation.
- Make sales and stock behavior correct under failures and concurrent updates.
- Produce a polished Executive Navy interface with a fast A1 Split POS checkout.
- Make installation and demonstration reproducible without editing source code.
- Rewrite the final report so every claim, diagram, table, screenshot, and test
  result corresponds to the delivered product.

## 3. Non-goals

The project will not include e-commerce, a mobile client, cloud synchronization,
online payment gateways, barcode/QR hardware integration, or multi-branch
inventory. It will use one SQL Server database and one desktop client per
process. Dark mode is excluded; the approved design is a light workspace with a
navy navigation rail.

## 4. Platform and compatibility

- Application: .NET 8 WPF, C#, x64
- Supported OS: Windows 10 22H2 and Windows 11
- Database: SQL Server 2019 or newer, including SQL Server Express/Developer
- Data access: Entity Framework Core 8 with the SQL Server provider
- Tests: xUnit on .NET 8
- Charts: LiveChartsCore WPF, used only for dashboard/report charts
- Logging: Microsoft.Extensions.Logging with a small custom rolling text-file
  provider
- Configuration: JSON settings with an example file; the local connection
  string file is excluded from version control
- Packaging: framework-dependent development build plus self-contained
  `win-x64` publish package

## 5. Solution architecture

The solution is named `BookstorePro.sln` and contains five projects.

### 5.1 BookstorePro.Domain

Contains entities, enums, value rules, and domain exceptions. It has no
dependency on WPF, EF Core, or SQL Server. Domain methods protect invariants such
as non-negative stock, valid invoice quantities, and valid discount ranges.

### 5.2 BookstorePro.Application

Contains use cases, DTOs, validators, authorization checks, service interfaces,
and transaction-oriented workflows. It depends only on Domain. Important
services include authentication, catalog, customer, supplier, stock receipt,
inventory adjustment, checkout, invoice cancellation, dashboard, reporting,
user administration, and audit querying.

### 5.3 BookstorePro.Infrastructure

Implements Application interfaces using EF Core and SQL Server. It contains the
`BookstoreDbContext`, entity configurations, migrations, database sequences,
repositories, transaction execution, PBKDF2 password hashing, CSV export, and
file logging. It depends on Domain and Application.

### 5.4 BookstorePro.Wpf

Contains Views, ViewModels, resource dictionaries, converters, navigation,
dialogs, print templates, and the composition root. It depends on Application
and Infrastructure. Code-behind is limited to view-only behavior that cannot be
expressed cleanly in XAML; business logic stays in ViewModels and services.

### 5.5 BookstorePro.Tests

Contains domain and application unit tests, ViewModel tests, and SQL Server
integration tests. The test project may reference all non-UI projects. WPF
behavior is tested at the ViewModel boundary.

Dependency direction:

`Wpf -> Application -> Domain` and
`Wpf -> Infrastructure -> Application/Domain`.

Domain never references an outer layer. Infrastructure is registered behind
Application interfaces through dependency injection.

## 6. Functional modules

### 6.1 Authentication and authorization

- Sign in with username and password.
- Roles: `Administrator` and `Staff`.
- Administrator can access all modules, manage accounts, change roles, and view
  the full audit log.
- Staff can use dashboard, catalog lookup, customers, sales, stock lookup, and
  standard reports, but cannot manage users or perform inventory adjustment.
- Passwords are stored as PBKDF2-SHA256 hash, random 128-bit salt, and iteration
  count. Plaintext passwords are never persisted or logged.
- After three consecutive failures in the same process, login is delayed for
  30 seconds. Successful login resets the counter.

### 6.2 Dashboard

- Today's revenue, completed-invoice count, sold-book quantity, and low-stock
  count.
- Revenue chart for the most recent seven calendar days.
- Top five books by sold quantity for the selected period.
- Quick action to open the new-sale screen.

### 6.3 Catalog

- Manage books, authors, fields, categories, and publishers.
- Search books by code, title, author, field, category, or publisher.
- Book-to-author is many-to-many through `BookAuthor`.
- Referenced records are deactivated instead of physically deleted.
- Book fields include code, title, authors, field, category, publisher, purchase
  price, sale price, publication date, edition, minimum stock level, and active
  status.

### 6.4 Customers

- Create, edit, deactivate, and search customers.
- Store customer code, full name, phone, email, address, and notes.
- Show purchase history and total spending.
- A sales invoice may omit the customer for walk-in sales.

### 6.5 Suppliers and inventory

- Manage suppliers and their contact information.
- Create stock receipts with one or more books, quantity, and purchase price.
- Post a receipt in one transaction, increasing inventory and creating movement
  records.
- Administrators may perform a documented inventory adjustment with a required
  reason.
- Show current quantity, minimum quantity, status, and movement history.
- Low stock means `Quantity <= MinimumStockLevel`.

### 6.6 Sales — A1 Split POS

- The left side shows searchable catalog results and current availability.
- The right side always shows the current cart, customer, discount, totals, and
  payment action.
- Adding the same book again increases its cart quantity.
- Quantity must be at least 1 and must not exceed current availability.
- Payment methods: cash and bank transfer.
- Invoice discount is a percentage. Staff may apply 0–10%; Administrator may
  apply 0–30%.
- Checkout stores the price and purchase cost snapshots used at sale time.
- The receipt is printable through a WPF `FlowDocument`.
- Invoice cancellation is allowed only for a completed invoice and requires a
  reason. Cancellation restores inventory and preserves the original data.

### 6.7 Reports and administration

- Revenue, cost, gross profit, and invoice count for an inclusive date range.
- Top-selling books and current/low-stock reports.
- CSV export uses UTF-8 with BOM so Vietnamese text opens correctly in Excel.
- User management supports create, deactivate, role change, and password reset.
- Audit log records login, create/update/deactivate, checkout, cancellation,
  stock receipt, adjustment, export, and user-administration actions.

## 7. Data model

All tables use an integer or long surrogate primary key. Business codes are
unique and generated from SQL Server sequences, never from `Random`. Display
formats are `S000001` for books, `TG000001` for authors, `KH000001` for
customers, `NCC000001` for suppliers, `HDyyyyMMdd-000001` for invoices, and
`PNyyyyMMdd-000001` for stock receipts.

### 7.1 Security

- `Role(Id, Name)`
- `UserAccount(Id, Username, PasswordHash, PasswordSalt, PasswordIterations,
  DisplayName, RoleId, IsActive, LastLoginAt, CreatedAt, RowVersion)`

### 7.2 Catalog

- `Author(Id, Code, Name, BirthDate, DeathDate, Hometown, IsActive, RowVersion)`
- `Field(Id, Name, IsActive, RowVersion)`
- `Category(Id, Name, FieldId, IsActive, RowVersion)`
- `Publisher(Id, Name, Phone, Email, Address, IsActive, RowVersion)`
- `Book(Id, Code, Title, FieldId, CategoryId, PublisherId, PurchasePrice,
  SalePrice, PublicationDate, Edition, IsActive, RowVersion)`
- `BookAuthor(BookId, AuthorId)`

### 7.3 Parties

- `Customer(Id, Code, FullName, Phone, Email, Address, Notes, IsActive,
  RowVersion)`
- `Supplier(Id, Code, Name, Phone, Email, Address, IsActive, RowVersion)`

### 7.4 Inventory

- `Inventory(BookId, Quantity, MinimumStockLevel, RowVersion)`
- `StockReceipt(Id, Code, SupplierId, ReceivedAt, Note, Status, CreatedById,
  CreatedAt)`
- `StockReceiptItem(StockReceiptId, BookId, Quantity, UnitCost)`
- `StockMovement(Id, BookId, MovementType, QuantityDelta, QuantityAfter,
  ReferenceType, ReferenceId, Reason, CreatedById, CreatedAt)`

Movement types are `Opening`, `Receipt`, `Sale`, `SaleCancellation`, and
`Adjustment`.

### 7.5 Sales

- `SalesInvoice(Id, Code, CustomerId, SoldAt, Status, PaymentMethod, Subtotal,
  DiscountPercent, DiscountAmount, Total, CancellationReason, CreatedById,
  CancelledById, CancelledAt, RowVersion)`
- `SalesInvoiceItem(SalesInvoiceId, BookId, Quantity, UnitPrice,
  UnitCostSnapshot, LineTotal)`

Statuses are `Completed` and `Cancelled`. Invoice items have a composite
primary key on `(SalesInvoiceId, BookId)`.

### 7.6 Audit

- `AuditLog(Id, UserAccountId, Action, EntityType, EntityId, Summary,
  CreatedAt)`

### 7.7 Data constraints

- Money uses `decimal(18,2)`; timestamps use `datetime2` in UTC and are
  displayed in the local Windows time zone.
- Quantity, prices, totals, and discount values cannot be negative.
- Discount is constrained to 0–30%.
- Invoice and receipt item quantity must be greater than zero.
- Usernames and business codes are unique.
- Foreign-key delete behavior is restrictive for transaction history.
- Search indexes cover book title/code, customer name/phone, invoice code/date,
  and stock-movement book/date.
- `rowversion` provides optimistic concurrency for mutable master records and
  inventory.

## 8. Critical workflows

### 8.1 Checkout

1. The ViewModel keeps an in-memory cart; adding an item does not change SQL
   Server.
2. The checkout command validates the current user, customer, quantities,
   discount authorization, and payment method.
3. Application opens one database transaction.
4. Infrastructure reloads each inventory row and validates availability.
5. It creates the invoice and items, calculates totals from trusted database
   prices, decrements inventory, creates stock movements, and writes an audit
   record.
6. All changes commit together. Any error rolls back everything.
7. The UI clears the cart only after a successful commit and offers the receipt
   print action.

### 8.2 Invoice cancellation

1. Only a completed invoice may be cancelled.
2. The command requires a non-empty reason and an authorized user.
3. In one transaction, the invoice status changes to `Cancelled`, inventory is
   restored from invoice items, cancellation movements are created, and an
   audit record is written.
4. A cancelled invoice cannot be cancelled again or edited.

### 8.3 Stock receipt

1. A draft exists only in the ViewModel until the user posts it.
2. Application validates supplier, items, quantities, and costs.
3. One transaction creates the receipt and items, increases inventory, updates
   each book's latest purchase price, creates movement records, and writes an
   audit record.

## 9. User interface design

The approved visual direction is Executive Navy:

- Dark navy navigation rail, light workspace, blue primary actions, restrained
  amber highlights, and high-contrast typography.
- Segoe UI Variable when available, with Segoe UI fallback.
- Eight-pixel spacing system, compact desktop density, and keyboard focus states.
- Minimum target resolution 1366×768; the layout also supports 1920×1080.
- Shared resource dictionaries define color, typography, spacing, button,
  textbox, ComboBox, DataGrid, dialog, badge, and navigation styles.
- Main shell navigation: Tổng quan, Sách, Bán hàng, Kho, Khách hàng, Nhà cung
  cấp, Báo cáo, and Quản trị when authorized.
- A1 Split POS keeps catalog and cart visible at the same time.
- Add/edit operations use modal dialogs with inline validation.
- Success uses brief in-app notifications; destructive actions require explicit
  confirmation.
- Loading and save commands disable repeated submission.

The visual companion mockups are design prototypes and will be labeled as such
in the report. Runtime screenshots may only be labeled as runtime screenshots
after capture from the Windows build.

## 10. Error handling and observability

- Field validation appears next to the relevant control.
- Domain/application errors map to concise Vietnamese messages.
- SQL/configuration/unexpected errors are logged with timestamp, exception, and
  correlation identifier; the UI never displays stack traces.
- Startup shows a connection-recovery screen with retry and configuration
  guidance when SQL Server is unavailable.
- EF Core concurrency exceptions map to a reload-and-retry prompt.
- The WPF dispatcher has a global unhandled-exception boundary that logs the
  incident and presents a safe recovery message.
- Logging must never include passwords, password hashes, salts, or full
  connection-string credentials.

## 11. Testing strategy

### 11.1 Unit tests

Tests cover:

- invoice subtotal, discount, total, and gross profit;
- staff/admin discount limits;
- insufficient, exact, and surplus stock cases;
- stock receipt and cancellation quantity changes;
- repeated cancellation rejection;
- business-code formatting;
- PBKDF2 verify/success/failure behavior;
- authorization decisions;
- catalog and customer validation;
- inactive entity rejection.

### 11.2 Application and ViewModel tests

- Checkout success and rollback behavior through test doubles.
- Receipt posting and invoice cancellation orchestration.
- Search/filter, command enablement, navigation, loading, validation, and error
  state transitions.

### 11.3 Integration tests

- EF Core model creation and migrations against SQL Server.
- Required constraints, unique indexes, and restrictive deletes.
- Transaction rollback and optimistic-concurrency conflict.
- Seed data and demo-account authentication.

### 11.4 Verification gates

- `dotnet build BookstorePro.sln -c Release` succeeds with zero errors.
- `dotnet test BookstorePro.sln -c Release` passes.
- A migration applies successfully to an empty database.
- Self-contained `win-x64` publish succeeds.
- Manual checklist covers every screen and the complete sale, cancellation,
  receipt, reporting, and role-restriction flows at 1366×768 and 1920×1080.

## 12. Seed and setup

The seed contains Vietnamese authors, publishers, books, customers, suppliers,
inventory, stock movements, and completed/cancelled invoices sufficient to
populate the dashboard and reports.

Demo credentials:

- Administrator: `admin` / `Admin@123!`
- Staff: `nhanvien` / `Staff@123!`

Passwords are converted to PBKDF2 hash/salt during seeding; plaintext exists
only in setup documentation.

The delivery includes:

- EF Core migrations;
- an idempotent SQL setup script;
- a PowerShell setup helper;
- `appsettings.example.json`;
- an `appsettings.Local.json` generated by the setup helper for the selected
  SQL Server instance and excluded from version control;
- a connection test;
- Vietnamese installation and demo instructions.

## 13. Submission package and report

The final package contains:

- clean source code and `BookstorePro.sln`;
- self-contained `win-x64` publish output;
- database migrations, setup script, seed, and configuration example;
- `README.md`, `HUONG_DAN_CAI_DAT.md`, `DEMO_GUIDE.md`, and
  `CREDITS.md`;
- automated-test results and manual-test checklist;
- final Word report in A4 and exported PDF;
- a compact ZIP without `.vs`, `bin`, `obj`, local logs, secrets, or user
  database files.

The report will contain:

- corrected cover information and automatic table of contents;
- problem statement, scope, functional and non-functional requirements;
- context, use-case, deployment, architecture, ERD, and critical sequence
  diagrams;
- physical data dictionary matching EF Core migrations;
- UI design rationale and labeled design prototypes;
- implementation details for MVVM, EF Core, authentication, authorization,
  transaction handling, concurrency, logging, and export;
- test plan, test cases, results, limitations, and future work;
- installation/demo instructions;
- inheritance statement, credits, and a contribution matrix describing what
  Hiếu and Minh Ánh added in the redesign.

## 14. Acceptance criteria

The redesign is accepted when:

1. A clean SQL Server database can be created using the provided setup path.
2. Both demo accounts can sign in and receive the correct navigation/actions.
3. Catalog, customer, supplier, user, and stock master-data workflows validate
   input and preserve referenced history.
4. A stock receipt increases inventory and creates movement/audit records in one
   transaction.
5. Checkout supports exact available quantity, rejects insufficient stock, and
   atomically creates invoice/items/movements.
6. Cancelling an invoice once restores the correct quantity; a second
   cancellation is rejected.
7. Dashboard and report values agree with stored invoices and cancellation
   status.
8. CSV export preserves Vietnamese text and selected date-range values.
9. The WPF solution builds in Release, all automated tests pass, and the
   `win-x64` package is produced.
10. The Word/PDF report contains no placeholder text, old student identity,
    unsupported feature claim, or mismatch with the final schema and product.
