# Bookstore Pro WPF Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a production-quality .NET 8 WPF bookstore-management application whose implementation, tests, setup materials, and rewritten final report match the approved design specification.

**Architecture:** Use a five-project clean architecture: WPF is the composition/UI layer, Application owns use cases and ports, Domain owns invariants, Infrastructure implements persistence/security/export/logging, and Tests exercise Domain, Application, ViewModels, and SQL Server integration. EF Core transactions are the consistency boundary for receipt posting, checkout, and invoice cancellation; ViewModels never access `BookstoreDbContext` directly.

**Tech Stack:** C# 12, .NET 8 WPF (`net8.0-windows`, x64), Entity Framework Core SQL Server 8.0.29, Microsoft.Extensions.Hosting 8.0.1, LiveChartsCore.SkiaSharpView.WPF 2.0.5, xUnit v3 3.2.2, Microsoft.NET.Test.Sdk 18.8.1, coverlet.collector 10.0.1, SQL Server 2019+, PowerShell 5.1+, Word `.docx`, PDF.

## Global Constraints

- Target .NET 8 WPF in C# with x64 output; support Windows 10 22H2 and Windows 11.
- Support SQL Server 2019 or newer, including Express and Developer editions.
- Use EF Core 8 with the SQL Server provider; do not build SQL statements from user input.
- Use `decimal(18,2)` for money and `datetime2` UTC timestamps displayed in the local Windows time zone.
- Use SQL Server `rowversion` for optimistic concurrency on mutable master data and inventory.
- Store passwords only as PBKDF2-SHA256 hashes with a random 128-bit salt and stored iteration count; never log credentials, hashes, salts, or full connection-string credentials.
- Roles are exactly `Administrator` and `Staff`; Staff discounts are 0–10%, Administrator discounts are 0–30%.
- Generate business codes from SQL Server sequences using formats `S000001`, `TG000001`, `KH000001`, `NCC000001`, `HDyyyyMMdd-000001`, and `PNyyyyMMdd-000001`.
- Complete receipt posting, checkout, and invoice cancellation in one database transaction per operation.
- Preserve referenced history by deactivating master records and using restrictive foreign-key deletes.
- Use the approved Executive Navy light workspace, Segoe UI Variable with Segoe UI fallback, an eight-pixel spacing system, and the A1 Split POS layout.
- Support 1366×768 and 1920×1080; include visible keyboard focus states and prevent duplicate submission while commands are running.
- Write UI and documentation text in Vietnamese; keep code symbols and database identifiers in English.
- Build a framework-dependent development output and a self-contained `win-x64` package.
- Keep `appsettings.Local.json`, logs, `.vs`, `bin`, `obj`, secrets, and user database files out of source and the submission ZIP.
- Preserve the inherited-work disclosure and credit the baseline while presenting the delivered WPF solution as the team's redesign.

---

## Delivery layout and file responsibilities

Implementation root: `submission-review/wpf-redesign/BookstorePro/`

```text
BookstorePro/
├── BookstorePro.sln                         # Five-project solution
├── Directory.Build.props                    # Language, analyzers, warnings, Windows targeting
├── Directory.Packages.props                 # Locked central package versions
├── .editorconfig                            # C# and XAML formatting rules
├── .gitignore                               # Generated output, local config, logs, secrets
├── README.md                                # Product overview and verification commands
├── HUONG_DAN_CAI_DAT.md                     # Vietnamese clean-machine setup
├── DEMO_GUIDE.md                            # Deterministic marking/demo path
├── CREDITS.md                               # Inheritance statement and contributions
├── src/
│   ├── BookstorePro.Domain/
│   │   ├── Common/                          # Entity base, concurrency token, domain exceptions
│   │   ├── Security/                        # Role names and user entity
│   │   ├── Catalog/                         # Book, author, field, category, publisher
│   │   ├── Parties/                         # Customer and supplier
│   │   ├── Inventory/                       # Inventory, receipts, movements
│   │   ├── Sales/                           # Invoice aggregate and price calculations
│   │   └── Auditing/                        # Append-only audit entity
│   ├── BookstorePro.Application/
│   │   ├── Abstractions/                    # Clock, session, transaction, audit, export ports
│   │   ├── Common/                          # Application exceptions shared by use cases/UI
│   │   ├── Security/                        # Authentication/authorization/user administration
│   │   ├── Catalog/                         # Catalog DTOs, validation, service
│   │   ├── Parties/                         # Customer/supplier DTOs and services
│   │   ├── Inventory/                       # Receipt, adjustment, stock-query use cases
│   │   ├── Sales/                           # Checkout and cancellation use cases
│   │   └── Reporting/                       # Dashboard/report queries and export
│   ├── BookstorePro.Infrastructure/
│   │   ├── Persistence/                     # DbContext, configurations, sequences, migrations
│   │   ├── Security/                        # PBKDF2 implementation and seed credential hashing
│   │   ├── Services/                        # Application port implementations
│   │   ├── Export/                          # UTF-8 BOM CSV writer
│   │   └── Logging/                         # Redacting rolling file logger
│   └── BookstorePro.Wpf/
│       ├── App.xaml(.cs)                    # Host composition and global exception boundary
│       ├── Resources/                       # Executive Navy tokens and control styles
│       ├── Services/                        # Navigation, dialogs, notifications, print service
│       ├── Converters/                      # Presentation-only value converters
│       ├── ViewModels/                      # Screen and dialog ViewModels
│       ├── Views/                           # Shell, screens, and modal dialogs
│       └── appsettings.example.json         # Safe configuration template
├── tests/BookstorePro.Tests/
│   ├── Domain/                              # Aggregate and invariant tests
│   ├── Application/                         # Use-case orchestration tests with fakes
│   ├── Infrastructure/                      # Model and SQL Server integration tests
│   ├── Wpf/                                 # ViewModel behavior tests
│   └── TestDoubles/                         # Clock, session, transaction, repository fakes
├── database/
│   └── BookstorePro.sql                     # Idempotent database/bootstrap entry point
├── scripts/
│   ├── setup-database.ps1                   # Instance selection, config generation, migration
│   ├── verify-release.ps1                   # Build, test, migration, publish, hash manifest
│   └── package-submission.ps1               # Clean reproducible ZIP creation
├── docs/
│   ├── diagrams/                            # Mermaid sources and exported PNG diagrams
│   ├── test-results/                        # TRX, coverage, and manual checklist
│   └── screenshots/                         # Verified runtime captures only
└── deliverables/
    ├── BookstorePro-win-x64/                 # Self-contained publish output
    ├── Bao-cao-cuoi-ky-BookstorePro.docx     # Rewritten A4 report
    ├── Bao-cao-cuoi-ky-BookstorePro.pdf      # Layout-checked PDF
    ├── SHA256SUMS.txt                        # Delivery integrity manifest
    └── BookstorePro-Submission.zip           # Final clean submission
```

The plan remains one integrated plan because catalog, stock, sales, reporting,
and audit share the same model and transaction boundaries. Each task below still
ends in an independently reviewable test/build gate.

## Canonical cross-task contracts

These signatures are fixed for the implementation. A later task must update this
section and every consumer in the same commit if a signature must change.

```csharp
public interface IClock { DateTime UtcNow { get; } }
public interface ICurrentSession
{
    UserSession? User { get; }
    void Begin(UserSession user);
    void End();
}
public sealed record UserSession(int UserId, string Username, string DisplayName, string RoleName);

public interface IDbTransactionRunner
{
    Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken);
}
public interface IAuditWriter
{
    Task WriteAsync(int userId, string action, string entityType, string? entityId,
        string summary, CancellationToken cancellationToken);
}
public interface ICsvExporter
{
    Task ExportAsync<T>(IReadOnlyList<T> rows, IReadOnlyList<CsvColumn<T>> columns,
        Stream destination, CancellationToken cancellationToken);
}
public sealed record CsvColumn<T>(string Header, Func<T, string> Value);
```

## Task 1: Create the buildable five-project solution

**Files:**
- Create: `BookstorePro/BookstorePro.sln`
- Create: `BookstorePro/Directory.Build.props`
- Create: `BookstorePro/Directory.Packages.props`
- Create: `BookstorePro/.editorconfig`
- Create: `BookstorePro/.gitignore`
- Create: `BookstorePro/src/BookstorePro.Domain/BookstorePro.Domain.csproj`
- Create: `BookstorePro/src/BookstorePro.Application/BookstorePro.Application.csproj`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/BookstorePro.Infrastructure.csproj`
- Create: `BookstorePro/src/BookstorePro.Wpf/BookstorePro.Wpf.csproj`
- Create: `BookstorePro/src/BookstorePro.Wpf/App.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/App.xaml.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/BookstorePro.Tests.csproj`
- Create: `BookstorePro/src/BookstorePro.Domain/packages.lock.json`
- Create: `BookstorePro/src/BookstorePro.Application/packages.lock.json`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/packages.lock.json`
- Create: `BookstorePro/src/BookstorePro.Wpf/packages.lock.json`
- Create: `BookstorePro/tests/BookstorePro.Tests/packages.lock.json`
- Test: `BookstorePro/tests/BookstorePro.Tests/SolutionSmokeTests.cs`

**Interfaces:**
- Consumes: none.
- Produces: five named projects; project references matching `Wpf -> Application -> Domain` and `Wpf -> Infrastructure -> Application/Domain`; common nullable and warning settings.

- [ ] **Step 1: Generate the solution and projects**

Run from `BookstorePro/`:

```powershell
dotnet new sln -n BookstorePro
dotnet new classlib -n BookstorePro.Domain -o src/BookstorePro.Domain -f net8.0
dotnet new classlib -n BookstorePro.Application -o src/BookstorePro.Application -f net8.0
dotnet new classlib -n BookstorePro.Infrastructure -o src/BookstorePro.Infrastructure -f net8.0
dotnet new wpf -n BookstorePro.Wpf -o src/BookstorePro.Wpf -f net8.0
dotnet new xunit -n BookstorePro.Tests -o tests/BookstorePro.Tests -f net8.0
dotnet sln add src/BookstorePro.Domain src/BookstorePro.Application src/BookstorePro.Infrastructure src/BookstorePro.Wpf tests/BookstorePro.Tests
dotnet add src/BookstorePro.Application reference src/BookstorePro.Domain
dotnet add src/BookstorePro.Infrastructure reference src/BookstorePro.Application src/BookstorePro.Domain
dotnet add src/BookstorePro.Wpf reference src/BookstorePro.Application src/BookstorePro.Infrastructure
dotnet add tests/BookstorePro.Tests reference src/BookstorePro.Domain src/BookstorePro.Application src/BookstorePro.Infrastructure src/BookstorePro.Wpf
```

- [ ] **Step 2: Lock package and compiler policy**

Create `Directory.Build.props` with:

```xml
<Project>
  <PropertyGroup>
    <LangVersion>12.0</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <Deterministic>true</Deterministic>
    <EnableWindowsTargeting>true</EnableWindowsTargeting>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
  </PropertyGroup>
</Project>
```

Create `Directory.Packages.props` with central package management and these exact
versions:

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.29" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Design" Version="8.0.29" />
    <PackageVersion Include="Microsoft.Extensions.Hosting" Version="8.0.1" />
    <PackageVersion Include="LiveChartsCore.SkiaSharpView.WPF" Version="2.0.5" />
    <PackageVersion Include="xunit.v3" Version="3.2.2" />
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="18.8.1" />
    <PackageVersion Include="coverlet.collector" Version="10.0.1" />
  </ItemGroup>
</Project>
```

Set WPF to `<TargetFramework>net8.0-windows</TargetFramework>`,
`<UseWPF>true</UseWPF>`, `<PlatformTarget>x64</PlatformTarget>`, and add Hosting
and LiveChartsCore package references. Add EF Core packages only to
Infrastructure and the test packages only to Tests. Multi-target Tests with
`<TargetFrameworks>net8.0;net8.0-windows</TargetFrameworks>`; conditionally enable
WPF and reference `BookstorePro.Wpf` only for `net8.0-windows`, and remove
`Wpf/**/*.cs` from compilation for `net8.0`. This permits Domain/Application/
Infrastructure tests on non-Windows authoring machines while keeping the full
WPF test gate on Windows.

Run `dotnet restore BookstorePro.sln` once and commit all five generated
`packages.lock.json` files. Later release restores use `--locked-mode`.

- [ ] **Step 3: Write the failing architecture smoke test**

```csharp
using Xunit;

namespace BookstorePro.Tests;

public sealed class SolutionSmokeTests
{
    [Fact]
    public void DomainAssembly_HasNoOuterLayerReferences()
    {
        var references = typeof(BookstorePro.Domain.AssemblyMarker)
            .Assembly.GetReferencedAssemblies()
            .Select(x => x.Name)
            .ToArray();

        Assert.DoesNotContain("BookstorePro.Application", references);
        Assert.DoesNotContain("BookstorePro.Infrastructure", references);
        Assert.DoesNotContain("BookstorePro.Wpf", references);
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter SolutionSmokeTests`

Expected: FAIL because `BookstorePro.Domain.AssemblyMarker` does not exist.

- [ ] **Step 5: Add assembly markers and safe ignore rules**

Create one marker in each project, with the namespace changed to match that
project:

```csharp
namespace BookstorePro.Domain;

public sealed class AssemblyMarker;
```

Add `.vs/`, `**/bin/`, `**/obj/`, `logs/`, `appsettings.Local.json`,
`*.user`, `*.suo`, `deliverables/BookstorePro-win-x64/`, `*.mdf`, and `*.ldf`
to `.gitignore`.

- [ ] **Step 6: Verify solution policy**

Run: `dotnet build BookstorePro.sln -c Release`

Expected: build succeeds with zero warnings and zero errors.

Run: `dotnet test BookstorePro.sln -c Release --filter SolutionSmokeTests`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add BookstorePro/BookstorePro.sln BookstorePro/Directory.Build.props BookstorePro/Directory.Packages.props BookstorePro/.editorconfig BookstorePro/.gitignore BookstorePro/src BookstorePro/tests
git commit -m "build: scaffold Bookstore Pro solution"
```

## Task 2: Implement the domain model and protected invariants

**Files:**
- Create: `BookstorePro/src/BookstorePro.Domain/Common/Entity.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Common/DomainValidationException.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Security/RoleNames.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Security/Role.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Security/UserAccount.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Catalog/Author.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Catalog/Field.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Catalog/Category.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Catalog/Publisher.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Catalog/Book.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Catalog/BookAuthor.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Parties/Customer.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Parties/Supplier.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Inventory/Inventory.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Inventory/StockReceipt.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Inventory/StockReceiptItem.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Inventory/StockReceiptStatus.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Inventory/StockMovement.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Inventory/MovementType.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Sales/SalesInvoice.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Sales/SalesInvoiceItem.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Sales/InvoiceStatus.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Sales/PaymentMethod.cs`
- Create: `BookstorePro/src/BookstorePro.Domain/Auditing/AuditLog.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Domain/InventoryTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Domain/SalesInvoiceTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Domain/StockReceiptTests.cs`

**Interfaces:**
- Consumes: Domain project from Task 1.
- Produces: `Inventory.Remove(int)`, `Inventory.Add(int)`, `Inventory.AdjustTo(int)`; `SalesInvoice.Create(...)`; `SalesInvoice.Cancel(...)`; `StockReceipt.Create(...)`; enums `MovementType`, `InvoiceStatus`, `PaymentMethod`.

- [ ] **Step 1: Write failing stock and invoice tests**

```csharp
[Theory]
[InlineData(5, 5, 0)]
[InlineData(5, 3, 2)]
public void Remove_AllowsExactOrLowerQuantity(int available, int sold, int expected)
{
    var inventory = new Inventory(bookId: 1, quantity: available, minimumStockLevel: 2);
    inventory.Remove(sold);
    Assert.Equal(expected, inventory.Quantity);
}

[Fact]
public void Remove_RejectsInsufficientStock()
{
    var inventory = new Inventory(1, 4, 2);
    var error = Assert.Throws<DomainValidationException>(() => inventory.Remove(5));
    Assert.Equal("Số lượng tồn kho không đủ.", error.Message);
}

[Fact]
public void CreateInvoice_CalculatesMoneyFromLines()
{
    var invoice = SalesInvoice.Create(
        code: "HD20260802-000001", customerId: null, soldAtUtc: new DateTime(2026, 8, 2, 3, 0, 0, DateTimeKind.Utc),
        paymentMethod: PaymentMethod.Cash, discountPercent: 10m, createdById: 1,
        items: new[]
        {
            new SalesInvoiceItem(bookId: 1, quantity: 2, unitPrice: 120_000m, unitCostSnapshot: 70_000m),
            new SalesInvoiceItem(bookId: 2, quantity: 1, unitPrice: 80_000m, unitCostSnapshot: 50_000m)
        });

    Assert.Equal(320_000m, invoice.Subtotal);
    Assert.Equal(32_000m, invoice.DiscountAmount);
    Assert.Equal(288_000m, invoice.Total);
    Assert.Equal(130_000m, invoice.GrossProfitBeforeDiscount);
}
```

- [ ] **Step 2: Run the domain tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "FullyQualifiedName~Domain"`

Expected: FAIL because the entities and domain exception have not been created.

- [ ] **Step 3: Implement entity bases and invariants**

Use `int` keys for master and aggregate roots, `long` for `StockMovement` and
`AuditLog`, and a `byte[] RowVersion` initialized to `Array.Empty<byte>()` on
mutable entities. Implement inventory rules exactly:

```csharp
public sealed class Inventory
{
    public int BookId { get; private set; }
    public int Quantity { get; private set; }
    public int MinimumStockLevel { get; private set; }
    public byte[] RowVersion { get; private set; } = Array.Empty<byte>();

    private Inventory() { }

    public Inventory(int bookId, int quantity, int minimumStockLevel)
    {
        if (bookId <= 0 || quantity < 0 || minimumStockLevel < 0)
            throw new DomainValidationException("Dữ liệu tồn kho không hợp lệ.");
        BookId = bookId;
        Quantity = quantity;
        MinimumStockLevel = minimumStockLevel;
    }

    public bool IsLowStock => Quantity <= MinimumStockLevel;

    public void Add(int quantity)
    {
        if (quantity <= 0) throw new DomainValidationException("Số lượng phải lớn hơn 0.");
        Quantity = checked(Quantity + quantity);
    }

    public void Remove(int quantity)
    {
        if (quantity <= 0) throw new DomainValidationException("Số lượng phải lớn hơn 0.");
        if (quantity > Quantity) throw new DomainValidationException("Số lượng tồn kho không đủ.");
        Quantity -= quantity;
    }

    public int AdjustTo(int countedQuantity)
    {
        if (countedQuantity < 0) throw new DomainValidationException("Tồn kho không được âm.");
        var delta = countedQuantity - Quantity;
        Quantity = countedQuantity;
        return delta;
    }
}
```

`SalesInvoice.Create` rejects an empty item list, non-positive quantities,
negative prices, and discounts outside 0–30. It calculates all persisted money
properties itself, rounding calculated currency to two decimal places with
`MidpointRounding.AwayFromZero`. It requires UTC `SoldAt`, `CreatedAt`, and
cancellation timestamps. `Cancel` requires status `Completed` and a non-blank
reason, then records cancelled user/time/reason without removing items.
`StockReceipt` requires a supplier, a UTC received time, and at least one valid
item. Master entities expose `Deactivate()` instead of deletion.

- [ ] **Step 4: Add boundary tests**

```csharp
[Theory]
[InlineData(-0.01)]
[InlineData(30.01)]
public void CreateInvoice_RejectsDiscountOutsideSystemRange(double value)
{
    var item = new SalesInvoiceItem(1, 1, 100m, 60m);
    Assert.Throws<DomainValidationException>(() => SalesInvoice.Create(
        "HD20260802-000002", null, DateTime.UtcNow, PaymentMethod.Cash,
        Convert.ToDecimal(value), 1, new[] { item }));
}

[Fact]
public void Cancel_RejectsSecondCancellation()
{
    var invoice = SalesInvoice.Create("HD20260802-000003", null, DateTime.UtcNow,
        PaymentMethod.BankTransfer, 0m, 1,
        new[] { new SalesInvoiceItem(1, 1, 100m, 60m) });
    invoice.Cancel(1, DateTime.UtcNow, "Khách trả hàng");
    Assert.Throws<DomainValidationException>(() =>
        invoice.Cancel(1, DateTime.UtcNow, "Hủy lần hai"));
}
```

- [ ] **Step 5: Verify domain behavior**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "FullyQualifiedName~Domain"`

Expected: all domain tests PASS.

Run: `dotnet build BookstorePro.sln -c Release`

Expected: build succeeds with zero warnings and zero errors.

- [ ] **Step 6: Commit**

```bash
git add BookstorePro/src/BookstorePro.Domain BookstorePro/tests/BookstorePro.Tests/Domain
git commit -m "feat: add protected bookstore domain model"
```

## Task 3: Map the EF Core model, sequences, constraints, and first migration

**Files:**
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/BookstoreDbContext.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/BookstoreDbContextFactory.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/ModelBuilderExtensions.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/BusinessCode.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/Configurations/*.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/Migrations/202608020001_InitialCreate.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/Migrations/BookstoreDbContextModelSnapshot.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/TestDoubles/SqlServerModelFactory.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/EfModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/CodeFormatTests.cs`

**Interfaces:**
- Consumes: all Task 2 entities.
- Produces: `BookstoreDbContext`; SQL sequences `BookSequence`, `AuthorSequence`, `CustomerSequence`, `SupplierSequence`, `InvoiceSequence`, `ReceiptSequence`; static `BusinessCode.FormatBook/FormatAuthor/FormatCustomer/FormatSupplier/FormatInvoice/FormatReceipt`.

- [ ] **Step 1: Write failing model-contract tests**

```csharp
[Fact]
public void Model_UsesRequiredMoneyAndConcurrencyMappings()
{
    using var db = SqlServerModelFactory.CreateContext();
    var invoice = db.Model.FindEntityType(typeof(SalesInvoice))!;
    Assert.Equal("decimal(18,2)", invoice.FindProperty(nameof(SalesInvoice.Total))!.GetColumnType());
    Assert.True(invoice.FindProperty(nameof(SalesInvoice.RowVersion))!.IsConcurrencyToken);

    var inventory = db.Model.FindEntityType(typeof(Inventory))!;
    Assert.True(inventory.FindProperty(nameof(Inventory.RowVersion))!.IsConcurrencyToken);
    Assert.Equal(DeleteBehavior.Restrict,
        invoice.GetForeignKeys().Single(x => x.PrincipalEntityType.ClrType == typeof(UserAccount)).DeleteBehavior);
}

[Theory]
[InlineData(1, "S000001")]
[InlineData(999999, "S999999")]
public void FormatBook_ReturnsSixDigitCode(long sequence, string expected) =>
    Assert.Equal(expected, BusinessCode.FormatBook(sequence));

[Fact]
public void FormatInvoice_IncludesLocalBusinessDateAndSequence() =>
    Assert.Equal("HD20260802-000041", BusinessCode.FormatInvoice(new DateOnly(2026, 8, 2), 41));
```

- [ ] **Step 2: Run the model tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "EfModelTests|CodeFormatTests"`

Expected: FAIL because `BookstoreDbContext`, `SqlServerModelFactory`, and
`BusinessCode` do not exist.

- [ ] **Step 3: Implement `BookstoreDbContext` and all configurations**

Expose a `DbSet<T>` for every entity from Section 7 of the design. Apply every
configuration from the assembly and define sequences with `StartsAt(1)` and
`IncrementsBy(1)`. The model must include:

```csharp
modelBuilder.HasSequence<long>("BookSequence");
modelBuilder.HasSequence<long>("AuthorSequence");
modelBuilder.HasSequence<long>("CustomerSequence");
modelBuilder.HasSequence<long>("SupplierSequence");
modelBuilder.HasSequence<long>("InvoiceSequence");
modelBuilder.HasSequence<long>("ReceiptSequence");
```

Configure:

- composite keys for `BookAuthor(BookId, AuthorId)`, `Inventory(BookId)`,
  `StockReceiptItem(StockReceiptId, BookId)`, and
  `SalesInvoiceItem(SalesInvoiceId, BookId)`;
- `decimal(18,2)` for every price, amount, cost, and total;
- `datetime2` for all timestamps;
- `IsRowVersion()` for mutable master records, `Inventory`, `SalesInvoice`, and
  `UserAccount`;
- checks for non-negative quantity/money/discount, discount at most 30, and item
  quantity greater than zero;
- unique indexes on username and business codes;
- search indexes on book title/code, customer full name/phone, invoice code/date,
  and movement book/date;
- `DeleteBehavior.Restrict` for historical foreign keys.

Implement code formatting with invariant culture and a six-digit overflow guard:

```csharp
public static string FormatInvoice(DateOnly localDate, long sequence) =>
    $"HD{localDate:yyyyMMdd}-{RequireSixDigits(sequence):D6}";

private static long RequireSixDigits(long value) => value is >= 1 and <= 999_999
    ? value
    : throw new ArgumentOutOfRangeException(nameof(value));
```

- [ ] **Step 4: Verify model metadata before creating the migration**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "EfModelTests|CodeFormatTests"`

Expected: PASS without opening a SQL Server connection; the tests inspect EF
model metadata through `UseSqlServer`.

- [ ] **Step 5: Generate and inspect the first migration**

Run:

```powershell
dotnet ef migrations add InitialCreate --project src/BookstorePro.Infrastructure --startup-project src/BookstorePro.Wpf --output-dir Persistence/Migrations
dotnet ef migrations script 0 InitialCreate --idempotent --project src/BookstorePro.Infrastructure --startup-project src/BookstorePro.Wpf --output database/BookstorePro.sql
```

Inspect `database/BookstorePro.sql` with:

```powershell
Select-String -Path database/BookstorePro.sql -Pattern 'CREATE SEQUENCE','rowversion','decimal\(18,2\)','CHECK','UNIQUE'
```

Expected: all six sequences plus concurrency, money, check, and uniqueness
definitions are present.

Normalize the generated migration filename, class name, and `[Migration]`
attribute to the stable ID `202608020001_InitialCreate` so report references and
review evidence do not depend on the implementation machine's clock.

- [ ] **Step 6: Verify and commit**

Run: `dotnet build BookstorePro.sln -c Release`

Expected: zero warnings and zero errors.

```bash
git add BookstorePro/src/BookstorePro.Infrastructure/Persistence BookstorePro/tests/BookstorePro.Tests/Infrastructure/EfModelTests.cs BookstorePro/tests/BookstorePro.Tests/Infrastructure/CodeFormatTests.cs BookstorePro/database/BookstorePro.sql
git commit -m "feat: map SQL Server persistence model"
```

## Task 4: Implement authentication, authorization, demo accounts, and session state

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/Abstractions/IClock.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Abstractions/ICurrentSession.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Abstractions/IAuditWriter.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Common/ApplicationExceptions.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/IPasswordHasher.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/IUserAccountStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/IAuthenticationService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/AuthorizationService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/AuthenticationService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/SecurityContracts.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Security/Pbkdf2PasswordHasher.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/UserAccountStore.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/SystemClock.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/DatabaseSeeder.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/CurrentSession.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/AuthenticationServiceTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/Pbkdf2PasswordHasherTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/AuthorizationServiceTests.cs`

**Interfaces:**
- Consumes: `UserAccount`, `RoleNames`, `IClock`.
- Produces: `IPasswordHasher.Hash(string)`, `IPasswordHasher.Verify(string, PasswordHash)`; `IAuthenticationService.SignInAsync(LoginRequest, CancellationToken)`; `AuthorizationService.EnsureAllowed(UserSession, Permission)`; canonical `ICurrentSession` and `UserSession`.

- [ ] **Step 1: Define contracts and write failing security tests**

```csharp
public sealed record PasswordHash(byte[] Hash, byte[] Salt, int Iterations);
public sealed record LoginRequest(string Username, string Password);
public sealed record LoginResult(bool Succeeded, UserSession? Session, string? Error,
    TimeSpan? RetryAfter);

public interface IPasswordHasher
{
    PasswordHash Hash(string password);
    bool Verify(string password, PasswordHash stored);
}

public interface IAuthenticationService
{
    Task<LoginResult> SignInAsync(LoginRequest request, CancellationToken cancellationToken);
}

public sealed class ValidationException(string message) : Exception(message);
public sealed class AuthorizationException(string message) : Exception(message);
public sealed class NotFoundException(string message) : Exception(message);
public sealed class DataConcurrencyException(string message, Exception? inner = null)
    : Exception(message, inner);
```

```csharp
[Fact]
public void Hash_UsesRandomSixteenByteSalt_AndVerifiesOnlyCorrectPassword()
{
    var sut = new Pbkdf2PasswordHasher(iterations: 210_000);
    var first = sut.Hash("StrongTestPassword#42");
    var second = sut.Hash("StrongTestPassword#42");
    Assert.Equal(16, first.Salt.Length);
    Assert.NotEqual(first.Salt, second.Salt);
    Assert.True(sut.Verify("StrongTestPassword#42", first));
    Assert.False(sut.Verify("wrong", first));
}

[Fact]
public async Task SignIn_ThirdConsecutiveFailure_ReturnsThirtySecondDelay()
{
    var sut = AuthenticationFixture.Create(active: true, password: "StrongTestPassword#42");
    await sut.SignInAsync(new("admin", "wrong"), default);
    await sut.SignInAsync(new("admin", "wrong"), default);
    var third = await sut.SignInAsync(new("admin", "wrong"), default);
    Assert.Equal(TimeSpan.FromSeconds(30), third.RetryAfter);
}
```

- [ ] **Step 2: Run security tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "AuthenticationServiceTests|Pbkdf2PasswordHasherTests|AuthorizationServiceTests"`

Expected: FAIL because the security contracts and implementations do not exist.

- [ ] **Step 3: Implement hashing and same-process login throttling**

Use `Rfc2898DeriveBytes.Pbkdf2` with SHA-256, a 16-byte salt from
`RandomNumberGenerator.GetBytes(16)`, 210,000 seed iterations, a 32-byte hash,
and `CryptographicOperations.FixedTimeEquals`. Normalize usernames with
`Trim().ToUpperInvariant()` for lookup while preserving the stored display form.

Keep a process-local `ConcurrentDictionary<string, FailureState>`. Failed
attempts 1–2 return `"Tên đăng nhập hoặc mật khẩu không đúng."`; failure 3 and
later returns a retry time 30 seconds after the most recent third-or-later
failure. This is the required three consecutive failed-login rule. A successful
login clears the entry, updates `LastLoginAt`, writes a
login audit entry, and returns `UserSession`. Inactive accounts always fail with
the same generic credential message.

- [ ] **Step 4: Implement exact role permissions**

```csharp
public enum Permission
{
    ViewDashboard, ViewCatalog, ManageCatalog, ManageCustomers, CreateSale,
    ViewInventory, PostStockReceipt, AdjustInventory, ViewStandardReports,
    ManageUsers, ViewFullAudit
}
```

Administrator receives all permissions. Staff receives exactly `ViewDashboard`,
`ViewCatalog`, `ManageCustomers`, `CreateSale`, `ViewInventory`,
`PostStockReceipt`, and `ViewStandardReports`; Staff does not receive
`ManageCatalog`, `AdjustInventory`, `ManageUsers`, or `ViewFullAudit`. Implement
`EnsureDiscountAllowed(UserSession session, decimal discountPercent)` with Staff
maximum 10 and Administrator maximum 30.

- [ ] **Step 5: Seed roles and demo accounts with hashes**

`DatabaseSeeder.SeedAsync` must be idempotent. It creates roles first and inserts
the accounts only when normalized usernames are absent. Store these PBKDF2-SHA256
seed vectors (210,000 iterations), generated through the production hasher; the
corresponding plaintext remains only in setup/demo documentation:

```text
admin: salt=A6OVvN/PoJxCRSoO1LYCUw== hash=4q1l8UZ0lOd6j28U0YWtn67SFCL3B6CMBTKde38unFw=
nhanvien: salt=rFHPYRgBhOS975Wi/LWLHw== hash=KT/5GZg0H5Nh16SHCm2mZofct9PUdBNc5wVdEvxz26o=
```

No plaintext password is assigned to an entity property, compiled into source,
or written to a log.

- [ ] **Step 6: Verify security behavior**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "AuthenticationServiceTests|Pbkdf2PasswordHasherTests|AuthorizationServiceTests"`

Expected: PASS for correct/incorrect passwords, random salts, delay/reset,
inactive-account rejection, role permissions, and both discount limits.

- [ ] **Step 7: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/Abstractions BookstorePro/src/BookstorePro.Application/Common BookstorePro/src/BookstorePro.Application/Security BookstorePro/src/BookstorePro.Infrastructure/Security BookstorePro/src/BookstorePro.Infrastructure/Services/UserAccountStore.cs BookstorePro/src/BookstorePro.Infrastructure/Services/SystemClock.cs BookstorePro/src/BookstorePro.Infrastructure/Persistence/DatabaseSeeder.cs BookstorePro/src/BookstorePro.Wpf/Services/CurrentSession.cs BookstorePro/tests/BookstorePro.Tests/Application BookstorePro/tests/BookstorePro.Tests/Infrastructure/Pbkdf2PasswordHasherTests.cs
git commit -m "feat: secure authentication and role access"
```

## Task 5: Implement catalog use cases and safe master-data lifecycle

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/CatalogContracts.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/IBookStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/IBookService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/IReferenceDataStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/IReferenceDataService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/BookService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Catalog/ReferenceDataService.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfBookStore.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfReferenceDataStore.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/BookServiceTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/ReferenceDataServiceTests.cs`

**Interfaces:**
- Consumes: catalog entities, `AuthorizationService`, `ICurrentSession`, `IAuditWriter`, `BusinessCode.FormatBook`, `BusinessCode.FormatAuthor`.
- Produces: `IBookService.SearchAsync(BookSearchQuery, CancellationToken)`, `CreateAsync(SaveBookRequest, CancellationToken)`, `UpdateAsync(int, SaveBookRequest, byte[], CancellationToken)`, `DeactivateAsync(int, byte[], CancellationToken)`; explicit author/field/category/publisher operations on `IReferenceDataService`.

The reference-data contract is exact:

```csharp
public sealed record SaveAuthorRequest(string Name, DateOnly? BirthDate,
    DateOnly? DeathDate, string? Hometown, bool IsActive);
public sealed record AuthorListItem(int Id, string Code, string Name,
    DateOnly? BirthDate, DateOnly? DeathDate, string? Hometown,
    bool IsActive, byte[] RowVersion);
public sealed record FieldListItem(int Id, string Name, bool IsActive,
    byte[] RowVersion);
public sealed record CategoryListItem(int Id, string Name, int FieldId,
    string FieldName, bool IsActive, byte[] RowVersion);
public sealed record SavePublisherRequest(string Name, string? Phone,
    string? Email, string? Address, bool IsActive);
public sealed record PublisherListItem(int Id, string Name, string? Phone,
    string? Email, string? Address, bool IsActive, byte[] RowVersion);

public interface IReferenceDataService
{
    Task<IReadOnlyList<AuthorListItem>> GetAuthorsAsync(string? search,
        CancellationToken cancellationToken);
    Task<int> CreateAuthorAsync(SaveAuthorRequest request,
        CancellationToken cancellationToken);
    Task UpdateAuthorAsync(int id, SaveAuthorRequest request, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivateAuthorAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<FieldListItem>> GetFieldsAsync(bool activeOnly,
        CancellationToken cancellationToken);
    Task<int> CreateFieldAsync(string name, CancellationToken cancellationToken);
    Task UpdateFieldAsync(int id, string name, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivateFieldAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<CategoryListItem>> GetCategoriesAsync(int? fieldId,
        bool activeOnly, CancellationToken cancellationToken);
    Task<int> CreateCategoryAsync(string name, int fieldId,
        CancellationToken cancellationToken);
    Task UpdateCategoryAsync(int id, string name, int fieldId, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivateCategoryAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<PublisherListItem>> GetPublishersAsync(string? search,
        CancellationToken cancellationToken);
    Task<int> CreatePublisherAsync(SavePublisherRequest request,
        CancellationToken cancellationToken);
    Task UpdatePublisherAsync(int id, SavePublisherRequest request, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivatePublisherAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
}
```

- [ ] **Step 1: Define DTOs and write failing validation/search tests**

```csharp
public sealed record BookSearchQuery(string? Text, int? FieldId, int? CategoryId,
    int? PublisherId, bool ActiveOnly = true);
public sealed record SaveBookRequest(string Title, IReadOnlyList<int> AuthorIds,
    int FieldId, int CategoryId, int PublisherId, decimal PurchasePrice,
    decimal SalePrice, DateOnly? PublicationDate, int? Edition,
    int MinimumStockLevel, bool IsActive);
public sealed record BookListItem(int Id, string Code, string Title, string Authors,
    string Field, string Category, string Publisher, decimal SalePrice,
    int Quantity, int MinimumStockLevel, bool IsActive, byte[] RowVersion);
public sealed record BookDetails(int Id, string Code, string Title,
    IReadOnlyList<int> AuthorIds, int FieldId, int CategoryId, int PublisherId,
    decimal PurchasePrice, decimal SalePrice, DateOnly? PublicationDate,
    int? Edition, int MinimumStockLevel, bool IsActive, byte[] RowVersion);

public interface IBookService
{
    Task<IReadOnlyList<BookListItem>> SearchAsync(BookSearchQuery query,
        CancellationToken cancellationToken);
    Task<BookDetails> GetAsync(int id, CancellationToken cancellationToken);
    Task<int> CreateAsync(SaveBookRequest request, CancellationToken cancellationToken);
    Task UpdateAsync(int id, SaveBookRequest request, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivateAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
}
```

```csharp
[Fact]
public async Task Create_RejectsCategoryOutsideSelectedField()
{
    var fixture = BookServiceFixture.Create(categoryFieldId: 2);
    var request = fixture.ValidRequest with { FieldId = 1, CategoryId = 9 };
    var error = await Assert.ThrowsAsync<ValidationException>(() =>
        fixture.Service.CreateAsync(request, default));
    Assert.Equal("Thể loại không thuộc lĩnh vực đã chọn.", error.Message);
}

[Fact]
public async Task Search_MatchesAuthorAndReturnsInventoryStatus()
{
    var fixture = BookServiceFixture.WithBook(title: "Dế Mèn phiêu lưu ký",
        author: "Tô Hoài", quantity: 2, minimumStock: 2);
    var rows = await fixture.Service.SearchAsync(new("Tô Hoài", null, null, null), default);
    Assert.Single(rows);
    Assert.Equal("Sắp hết", rows[0].Quantity <= rows[0].MinimumStockLevel ? "Sắp hết" : "Còn hàng");
}
```

- [ ] **Step 2: Run catalog tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "BookServiceTests|ReferenceDataServiceTests"`

Expected: FAIL because the catalog application types do not exist.

- [ ] **Step 3: Implement validation and service orchestration**

Validation messages are exact Vietnamese strings:

- blank title/name: `"Thông tin bắt buộc chưa được nhập."`;
- no author: `"Sách phải có ít nhất một tác giả."`;
- negative price/stock: `"Giá và mức tồn tối thiểu không được âm."`;
- sale price lower than zero is rejected; sale price may be lower than purchase
  price but the UI shows an amber warning;
- category/field mismatch: `"Thể loại không thuộc lĩnh vực đã chọn."`;
- inactive referenced entity: `"Dữ liệu tham chiếu đã ngừng sử dụng."`.

All mutations require `ManageCatalog`; Staff retains search/detail access but
does not create, edit, deactivate, or manage reference data. `CreateAsync`
requests the next SQL sequence value inside the store, formats the
business code, creates the `Inventory` row with quantity 0, and audits `Create`.
`UpdateAsync` uses the supplied `RowVersion`, replaces the `BookAuthor` set, and
audits changed fields. `DeactivateAsync` never removes the row. Search uses EF
parameters and `AsNoTracking`, matches code/title/author/field/category/publisher,
and returns a single joined projection without per-row queries.

- [ ] **Step 4: Add lifecycle and concurrency tests**

```csharp
[Fact]
public async Task Deactivate_PreservesReferencedBookAndWritesAudit()
{
    var fixture = BookServiceFixture.WithReferencedBook();
    await fixture.Service.DeactivateAsync(1, fixture.RowVersion, default);
    Assert.False(fixture.Store.Book.IsActive);
    Assert.Equal("Deactivate", fixture.Audit.Entries.Single().Action);
    Assert.False(fixture.Store.DeleteWasCalled);
}

[Fact]
public async Task Update_PassesOriginalRowVersionToStore()
{
    var fixture = BookServiceFixture.Create();
    var version = new byte[] { 1, 4, 9 };
    await fixture.Service.UpdateAsync(1, fixture.ValidRequest, version, default);
    Assert.Equal(version, fixture.Store.LastExpectedRowVersion);
}
```

- [ ] **Step 5: Verify catalog behavior and query shape**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "BookServiceTests|ReferenceDataServiceTests"`

Expected: PASS for validation, search dimensions, many-to-many authors,
deactivation, auditing, and concurrency token forwarding.

- [ ] **Step 6: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/Catalog BookstorePro/src/BookstorePro.Infrastructure/Services/EfBookStore.cs BookstorePro/src/BookstorePro.Infrastructure/Services/EfReferenceDataStore.cs BookstorePro/tests/BookstorePro.Tests/Application/BookServiceTests.cs BookstorePro/tests/BookstorePro.Tests/Application/ReferenceDataServiceTests.cs
git commit -m "feat: add catalog management use cases"
```

## Task 6: Implement customer and supplier use cases

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/Parties/PartyContracts.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Parties/ICustomerService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Parties/ISupplierService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Parties/CustomerService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Parties/SupplierService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Parties/IPartyStore.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfPartyStore.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/CustomerServiceTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/SupplierServiceTests.cs`

**Interfaces:**
- Consumes: `Customer`, `Supplier`, `AuthorizationService`, `ICurrentSession`, `IAuditWriter`, customer/supplier code formatters.
- Produces: `ICustomerService.SearchAsync(string?, CancellationToken)`, `GetDetailsAsync(int, CancellationToken)`, `CreateAsync(SaveCustomerRequest, CancellationToken)`, `UpdateAsync(int, SaveCustomerRequest, byte[], CancellationToken)`, `DeactivateAsync(int, byte[], CancellationToken)`; matching supplier operations on `ISupplierService`.

- [ ] **Step 1: Define DTOs and failing party tests**

```csharp
public sealed record SaveCustomerRequest(string FullName, string? Phone,
    string? Email, string? Address, string? Notes, bool IsActive);
public sealed record CustomerListItem(int Id, string Code, string FullName,
    string? Phone, string? Email, bool IsActive, byte[] RowVersion);
public sealed record CustomerDetails(CustomerListItem Customer,
    string? Address, string? Notes, decimal TotalSpending,
    IReadOnlyList<CustomerPurchaseRow> Purchases);
public sealed record CustomerPurchaseRow(int InvoiceId, string Code,
    DateTime SoldAtUtc, decimal Total, InvoiceStatus Status);
public sealed record SaveSupplierRequest(string Name, string? Phone,
    string? Email, string? Address, bool IsActive);
public sealed record SupplierListItem(int Id, string Code, string Name,
    string? Phone, string? Email, bool IsActive, byte[] RowVersion);
public sealed record SupplierDetails(SupplierListItem Supplier, string? Address);

public interface ICustomerService
{
    Task<IReadOnlyList<CustomerListItem>> SearchAsync(string? text,
        CancellationToken cancellationToken);
    Task<CustomerDetails> GetDetailsAsync(int id, CancellationToken cancellationToken);
    Task<int> CreateAsync(SaveCustomerRequest request, CancellationToken cancellationToken);
    Task UpdateAsync(int id, SaveCustomerRequest request, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivateAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
}

public interface ISupplierService
{
    Task<IReadOnlyList<SupplierListItem>> SearchAsync(string? text,
        CancellationToken cancellationToken);
    Task<SupplierDetails> GetDetailsAsync(int id, CancellationToken cancellationToken);
    Task<int> CreateAsync(SaveSupplierRequest request, CancellationToken cancellationToken);
    Task UpdateAsync(int id, SaveSupplierRequest request, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task DeactivateAsync(int id, byte[] rowVersion,
        CancellationToken cancellationToken);
}
```

```csharp
[Theory]
[InlineData("bad-email")]
[InlineData("a@")]
public async Task CreateCustomer_RejectsInvalidEmail(string email)
{
    var fixture = CustomerServiceFixture.Create();
    var request = new SaveCustomerRequest("Nguyễn Văn An", "0909000000", email,
        "Hà Nội", null, true);
    var error = await Assert.ThrowsAsync<ValidationException>(() =>
        fixture.Service.CreateAsync(request, default));
    Assert.Equal("Email không đúng định dạng.", error.Message);
}

[Fact]
public async Task Details_ExcludesCancelledInvoicesFromTotalSpending()
{
    var fixture = CustomerServiceFixture.WithInvoices(
        (InvoiceStatus.Completed, 250_000m), (InvoiceStatus.Cancelled, 80_000m));
    var details = await fixture.Service.GetDetailsAsync(1, default);
    Assert.Equal(250_000m, details.TotalSpending);
    Assert.Equal(2, details.Purchases.Count);
}
```

- [ ] **Step 2: Run party tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "CustomerServiceTests|SupplierServiceTests"`

Expected: FAIL because the party contracts and services do not exist.

- [ ] **Step 3: Implement party validation and persistence**

Trim all text before persistence. Require full name/supplier name. Accept blank
optional values as `null`. Validate email with `MailAddress.TryCreate`; validate
Vietnamese phone input after removing spaces and punctuation against 9–11
digits. Search customer code/name/phone and supplier code/name/phone with
parameterized EF predicates. Customer detail includes all invoices but sums only
`Completed`. Create uses the appropriate SQL sequence; update and deactivate use
the original `RowVersion`; every mutation writes an audit event.

Customer mutations require `ManageCustomers`; supplier mutations require
`PostStockReceipt`. Both roles may use the operations assigned in Task 4, while
all read methods still require an authenticated session.

- [ ] **Step 4: Add search and history-preservation tests**

```csharp
[Fact]
public async Task SearchCustomer_MatchesPhoneWithoutFormattingCharacters()
{
    var fixture = CustomerServiceFixture.WithCustomer("0909 123 456");
    var result = await fixture.Service.SearchAsync("0909123456", default);
    Assert.Single(result);
}

[Fact]
public async Task DeactivateSupplier_DoesNotDeleteReceipts()
{
    var fixture = SupplierServiceFixture.WithPostedReceipt();
    await fixture.Service.DeactivateAsync(1, fixture.RowVersion, default);
    Assert.False(fixture.Store.Supplier.IsActive);
    Assert.Single(fixture.Store.Receipts);
}
```

- [ ] **Step 5: Verify party behavior**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "CustomerServiceTests|SupplierServiceTests"`

Expected: PASS for validation, normalized search, customer spending, sequence
codes, optimistic concurrency forwarding, deactivation, and audit calls.

- [ ] **Step 6: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/Parties BookstorePro/src/BookstorePro.Infrastructure/Services/EfPartyStore.cs BookstorePro/tests/BookstorePro.Tests/Application/CustomerServiceTests.cs BookstorePro/tests/BookstorePro.Tests/Application/SupplierServiceTests.cs
git commit -m "feat: add customer and supplier workflows"
```

## Task 7: Implement atomic stock receipts, adjustments, and movement queries

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/Abstractions/IDbTransactionRunner.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Inventory/InventoryContracts.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Inventory/IInventoryStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Inventory/IInventoryService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Inventory/InventoryService.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/EfTransactionRunner.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfInventoryStore.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfAuditWriter.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/TestDoubles/SnapshotTransactionRunner.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/InventoryServiceTests.cs`

**Interfaces:**
- Consumes: canonical `IDbTransactionRunner`, `IAuditWriter`, `ICurrentSession`; `Inventory`, `StockReceipt`, `StockReceiptItem`, `StockMovement`; permission `AdjustInventory`.
- Produces: `IInventoryService.SearchAsync(InventorySearchQuery, CancellationToken)`, `GetMovementsAsync(int, CancellationToken)`, `PostReceiptAsync(PostStockReceiptRequest, CancellationToken)`, `AdjustAsync(AdjustInventoryRequest, CancellationToken)`.

- [ ] **Step 1: Define inventory contracts**

```csharp
public sealed record StockReceiptLineRequest(int BookId, int Quantity, decimal UnitCost);
public sealed record PostStockReceiptRequest(int SupplierId, DateTime ReceivedAtUtc,
    string? Note, IReadOnlyList<StockReceiptLineRequest> Items);
public sealed record PostStockReceiptResult(int ReceiptId, string Code, decimal TotalCost);
public sealed record AdjustInventoryRequest(int BookId, int CountedQuantity,
    string Reason, byte[] ExpectedRowVersion);
public sealed record InventorySearchQuery(string? Text, bool LowStockOnly);
public sealed record InventoryRow(int BookId, string BookCode, string Title,
    int Quantity, int MinimumStockLevel, bool IsLowStock, byte[] RowVersion);
public sealed record StockMovementRow(long Id, string BookCode, string BookTitle,
    MovementType MovementType, int QuantityDelta, int QuantityAfter,
    string ReferenceType, string ReferenceId, string? Reason, DateTime CreatedAtUtc);

public interface IInventoryService
{
    Task<IReadOnlyList<InventoryRow>> SearchAsync(InventorySearchQuery query,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<StockMovementRow>> GetMovementsAsync(int bookId,
        CancellationToken cancellationToken);
    Task<PostStockReceiptResult> PostReceiptAsync(PostStockReceiptRequest request,
        CancellationToken cancellationToken);
    Task AdjustAsync(AdjustInventoryRequest request, CancellationToken cancellationToken);
}
```

- [ ] **Step 2: Write failing transaction tests**

```csharp
[Fact]
public async Task PostReceipt_IncreasesStockUpdatesCostAndWritesMovementsAtomically()
{
    var fixture = InventoryServiceFixture.Create((bookId: 1, quantity: 4, cost: 60_000m));
    var result = await fixture.Service.PostReceiptAsync(new(
        SupplierId: 1, ReceivedAtUtc: fixture.Clock.UtcNow, Note: "Nhập đầu tháng",
        Items: new[] { new StockReceiptLineRequest(1, 6, 65_000m) }), default);

    Assert.Equal(10, fixture.Store.Inventory[1].Quantity);
    Assert.Equal(65_000m, fixture.Store.Books[1].PurchasePrice);
    Assert.Equal(6, fixture.Store.Movements.Single().QuantityDelta);
    Assert.Equal(10, fixture.Store.Movements.Single().QuantityAfter);
    Assert.Equal(390_000m, result.TotalCost);
    Assert.True(fixture.Transaction.Committed);
}

[Fact]
public async Task PostReceipt_WhenSecondLineFails_RollsBackEveryChange()
{
    var fixture = InventoryServiceFixture.Create((1, 4, 60_000m), (2, 7, 50_000m));
    fixture.Store.ThrowWhenLoadingBookId = 2;
    await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Service.PostReceiptAsync(
        new(1, fixture.Clock.UtcNow, null, new[]
        {
            new StockReceiptLineRequest(1, 2, 62_000m),
            new StockReceiptLineRequest(2, 3, 52_000m)
        }), default));
    Assert.Equal(4, fixture.Store.Inventory[1].Quantity);
    Assert.Empty(fixture.Store.Receipts);
    Assert.Empty(fixture.Store.Movements);
}
```

- [ ] **Step 3: Run inventory tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter InventoryServiceTests`

Expected: FAIL because the inventory service and transaction runner do not
exist.

- [ ] **Step 4: Implement receipt posting inside one transaction**

`PostReceiptAsync` requires an active supplier, at least one line, unique book
IDs, quantities above zero, and costs at or above zero. Inside
`IDbTransactionRunner.ExecuteAsync` it obtains the receipt sequence, creates the
`PNyyyyMMdd-000001` code using the Windows local date corresponding to
`ReceivedAtUtc`, loads each inventory row for update, calls `Inventory.Add`,
updates `Book.PurchasePrice`, creates one `Receipt` movement per line, creates
the receipt/items, writes one audit entry, saves once, and commits. Catch nothing
inside the transaction; the runner rolls back and rethrows.

`EfTransactionRunner` uses the execution strategy and transaction pattern:

```csharp
public async Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> action,
    CancellationToken cancellationToken)
{
    var strategy = db.Database.CreateExecutionStrategy();
    return await strategy.ExecuteAsync(async () =>
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var result = await action(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    });
}
```

- [ ] **Step 5: Implement administrator-only adjustment**

Require a non-blank trimmed reason and `AdjustInventory` permission. Load the
inventory using `ExpectedRowVersion`, call `AdjustTo`, reject a zero delta with
`"Số lượng kiểm kê không thay đổi."`, then create an `Adjustment` movement and
audit entry in one transaction. Staff receives
`"Bạn không có quyền điều chỉnh tồn kho."`.

- [ ] **Step 6: Add adjustment and low-stock tests**

```csharp
[Fact]
public async Task Adjust_StaffIsRejectedBeforeStoreMutation()
{
    var fixture = InventoryServiceFixture.CreateAsStaff((1, 5, 60_000m));
    await Assert.ThrowsAsync<AuthorizationException>(() => fixture.Service.AdjustAsync(
        new(1, 3, "Kiểm kê thực tế", fixture.RowVersion), default));
    Assert.Equal(5, fixture.Store.Inventory[1].Quantity);
}

[Theory]
[InlineData(2, 2, true)]
[InlineData(3, 2, false)]
public async Task Search_UsesLessThanOrEqualForLowStock(int quantity, int minimum, bool expected)
{
    var fixture = InventoryServiceFixture.Create((1, quantity, 60_000m), minimum);
    var row = Assert.Single(await fixture.Service.SearchAsync(new(null, false), default));
    Assert.Equal(expected, row.IsLowStock);
}
```

- [ ] **Step 7: Verify inventory workflows**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter InventoryServiceTests`

Expected: PASS for posting, rollback, latest cost, exact movement balances,
authorization, reason validation, low stock, and optimistic-concurrency token use.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/Abstractions/IDbTransactionRunner.cs BookstorePro/src/BookstorePro.Application/Inventory BookstorePro/src/BookstorePro.Infrastructure/Persistence/EfTransactionRunner.cs BookstorePro/src/BookstorePro.Infrastructure/Services/EfInventoryStore.cs BookstorePro/src/BookstorePro.Infrastructure/Services/EfAuditWriter.cs BookstorePro/tests/BookstorePro.Tests/Application/InventoryServiceTests.cs BookstorePro/tests/BookstorePro.Tests/TestDoubles/SnapshotTransactionRunner.cs
git commit -m "feat: add transactional inventory workflows"
```

## Task 8: Implement atomic checkout and invoice cancellation

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/Sales/SalesContracts.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Sales/ISalesStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Sales/ICheckoutService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Sales/CheckoutService.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfSalesStore.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/CheckoutServiceTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/InvoiceCancellationTests.cs`

**Interfaces:**
- Consumes: `SalesInvoice`, `Inventory`, `StockMovement`, `AuthorizationService`, `ICurrentSession`, `IDbTransactionRunner`, `IAuditWriter`, `BusinessCode.FormatInvoice`.
- Produces: `ICheckoutService.CheckoutAsync(CheckoutRequest, CancellationToken)`, `CancelInvoiceAsync(CancelInvoiceRequest, CancellationToken)`, `GetInvoiceAsync(int, CancellationToken)`.

- [ ] **Step 1: Define sales contracts**

```csharp
public sealed record CheckoutLineRequest(int BookId, int Quantity);
public sealed record CheckoutRequest(int? CustomerId, decimal DiscountPercent,
    PaymentMethod PaymentMethod, IReadOnlyList<CheckoutLineRequest> Items);
public sealed record CheckoutResult(int InvoiceId, string Code, decimal Subtotal,
    decimal DiscountAmount, decimal Total);
public sealed record CancelInvoiceRequest(int InvoiceId, string Reason,
    byte[] ExpectedRowVersion);
public sealed record InvoiceLineDetails(string BookCode, string Title, int Quantity,
    decimal UnitPrice, decimal UnitCostSnapshot, decimal LineTotal);
public sealed record InvoiceDetails(int Id, string Code, DateTime SoldAtUtc,
    string? CustomerName, string SellerName, InvoiceStatus Status,
    PaymentMethod PaymentMethod, decimal Subtotal, decimal DiscountPercent,
    decimal DiscountAmount, decimal Total, IReadOnlyList<InvoiceLineDetails> Items,
    byte[] RowVersion);
public sealed record InvoiceSearchQuery(string? Code, DateOnly? From,
    DateOnly? To, InvoiceStatus? Status);
public sealed record InvoiceListItem(int Id, string Code, DateTime SoldAtUtc,
    string? CustomerName, string SellerName, InvoiceStatus Status,
    PaymentMethod PaymentMethod, decimal Total, byte[] RowVersion);

public interface ICheckoutService
{
    Task<CheckoutResult> CheckoutAsync(CheckoutRequest request,
        CancellationToken cancellationToken);
    Task CancelInvoiceAsync(CancelInvoiceRequest request,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<InvoiceListItem>> SearchInvoicesAsync(InvoiceSearchQuery query,
        CancellationToken cancellationToken);
    Task<InvoiceDetails> GetInvoiceAsync(int invoiceId,
        CancellationToken cancellationToken);
}
```

- [ ] **Step 2: Write failing checkout correctness tests**

```csharp
[Fact]
public async Task Checkout_ExactAvailableQuantity_SucceedsAndStoresTrustedSnapshots()
{
    var fixture = CheckoutFixture.CreateAsStaff(bookId: 1, available: 3,
        salePrice: 120_000m, purchasePrice: 70_000m);
    var result = await fixture.Service.CheckoutAsync(
        new(null, 10m, PaymentMethod.Cash,
            new[] { new CheckoutLineRequest(1, 3) }), default);

    Assert.Equal(0, fixture.Store.Inventory[1].Quantity);
    var line = fixture.Store.Invoices.Single().Items.Single();
    Assert.Equal(120_000m, line.UnitPrice);
    Assert.Equal(70_000m, line.UnitCostSnapshot);
    Assert.Equal(324_000m, result.Total);
    Assert.Equal(-3, fixture.Store.Movements.Single().QuantityDelta);
}

[Fact]
public async Task Checkout_InsufficientStock_RollsBackInvoiceAndEveryStockChange()
{
    var fixture = CheckoutFixture.CreateAsStaff(1, available: 2,
        salePrice: 100_000m, purchasePrice: 60_000m);
    await Assert.ThrowsAsync<DomainValidationException>(() => fixture.Service.CheckoutAsync(
        new(null, 0m, PaymentMethod.Cash,
            new[] { new CheckoutLineRequest(1, 3) }), default));
    Assert.Equal(2, fixture.Store.Inventory[1].Quantity);
    Assert.Empty(fixture.Store.Invoices);
    Assert.Empty(fixture.Store.Movements);
}
```

- [ ] **Step 3: Run sales tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "CheckoutServiceTests|InvoiceCancellationTests"`

Expected: FAIL because the sales service and contracts do not exist.

- [ ] **Step 4: Implement checkout as one trusted transaction**

Validate an authenticated user, optional active customer, at least one unique
book, positive quantities, known payment method (`Cash`/tiền mặt or
`BankTransfer`/bank transfer/chuyển khoản), and role discount before
opening the transaction. Within the transaction, use the local business date and
invoice sequence for the code; load each active book and inventory row for
update; use current database price/cost rather than UI values; call
`Inventory.Remove`; create `Sale` movements whose `QuantityAfter` matches the
post-removal inventory; create the aggregate/items; audit `Checkout`; save and
commit. Return only committed invoice values.

- [ ] **Step 5: Add pricing, role, duplicate-line, and rollback tests**

```csharp
[Fact]
public async Task Checkout_IgnoresStaleDisplayedPriceAndUsesDatabasePrice()
{
    var fixture = CheckoutFixture.CreateAsStaff(1, 5, 150_000m, 90_000m);
    var result = await fixture.Service.CheckoutAsync(
        new(null, 0m, PaymentMethod.BankTransfer,
            new[] { new CheckoutLineRequest(1, 1) }), default);
    Assert.Equal(150_000m, result.Total);
}

[Fact]
public async Task Checkout_StaffDiscountAboveTen_IsRejectedBeforeTransaction()
{
    var fixture = CheckoutFixture.CreateAsStaff(1, 5, 100_000m, 60_000m);
    await Assert.ThrowsAsync<AuthorizationException>(() => fixture.Service.CheckoutAsync(
        new(null, 10.01m, PaymentMethod.Cash,
            new[] { new CheckoutLineRequest(1, 1) }), default));
    Assert.False(fixture.Transaction.Started);
}

[Fact]
public async Task Checkout_DuplicateBookLines_AreRejected()
{
    var fixture = CheckoutFixture.CreateAsAdministrator(1, 5, 100_000m, 60_000m);
    await Assert.ThrowsAsync<ValidationException>(() => fixture.Service.CheckoutAsync(
        new(null, 0m, PaymentMethod.Cash, new[]
        {
            new CheckoutLineRequest(1, 1), new CheckoutLineRequest(1, 2)
        }), default));
}
```

- [ ] **Step 6: Implement cancellation and write failing-first tests**

```csharp
[Fact]
public async Task CancelInvoice_RestoresAllInventoryAndPreservesOriginalItems()
{
    var fixture = CancellationFixture.WithCompletedInvoice((bookId: 1, quantity: 2));
    await fixture.Service.CancelInvoiceAsync(
        new(fixture.Invoice.Id, "Khách đổi ý", fixture.Invoice.RowVersion), default);
    Assert.Equal(InvoiceStatus.Cancelled, fixture.Invoice.Status);
    Assert.Equal(7, fixture.Store.Inventory[1].Quantity);
    Assert.Equal(2, fixture.Invoice.Items.Single().Quantity);
    Assert.Equal(2, fixture.Store.Movements.Single().QuantityDelta);
}

[Fact]
public async Task CancelInvoice_SecondAttempt_IsRejectedWithoutNewMovement()
{
    var fixture = CancellationFixture.WithCancelledInvoice();
    await Assert.ThrowsAsync<DomainValidationException>(() =>
        fixture.Service.CancelInvoiceAsync(
            new(fixture.Invoice.Id, "Hủy lại", fixture.Invoice.RowVersion), default));
    Assert.Empty(fixture.Store.Movements);
}
```

Checkout, invoice search/detail, and cancellation require `CreateSale`.
Cancellation requires a non-blank reason and a completed invoice. In one
transaction, call `SalesInvoice.Cancel`, restore each inventory row, add
`SaleCancellation` movements, and audit `Cancel`. Do not change original prices,
items, seller, sold time, or totals.

`SearchInvoicesAsync` validates `From <= To`, converts the optional inclusive
local dates to UTC half-open bounds, filters code/status in SQL, returns newest
first, and never materializes invoice items. `GetInvoiceAsync` loads items only
for the selected invoice.

- [ ] **Step 7: Verify all sales workflows**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "CheckoutServiceTests|InvoiceCancellationTests"`

Expected: PASS for exact/insufficient stock, trusted price snapshots, both role
limits, transaction rollback, cancellation restoration, repeated rejection,
reason validation, movement balances, and audit writes.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/Sales BookstorePro/src/BookstorePro.Infrastructure/Services/EfSalesStore.cs BookstorePro/tests/BookstorePro.Tests/Application/CheckoutServiceTests.cs BookstorePro/tests/BookstorePro.Tests/Application/InvoiceCancellationTests.cs
git commit -m "feat: add atomic sales and cancellation"
```

## Task 9: Implement dashboard, reports, CSV export, user administration, and audit queries

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/Abstractions/ICsvExporter.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Reporting/ReportingContracts.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Reporting/IReportingStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Reporting/IReportingService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Reporting/ReportingService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/IUserAdministrationService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/IUserAdministrationStore.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/UserAdministrationService.cs`
- Create: `BookstorePro/src/BookstorePro.Application/Security/IAuditQueryService.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfReportingStore.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfUserAdministrationStore.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Services/EfAuditQueryService.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Export/Utf8BomCsvExporter.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/ReportingServiceTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Application/UserAdministrationTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/Utf8BomCsvExporterTests.cs`

**Interfaces:**
- Consumes: completed/cancelled invoices, current inventory, `ICurrentSession`, `AuthorizationService`, `IPasswordHasher`, `IAuditWriter`.
- Produces: exact query/export methods on `IReportingService`; exact create/deactivate/change-role/reset-password methods on `IUserAdministrationService`; `IAuditQueryService.SearchAsync(AuditQuery, CancellationToken)`.

Use these exact application-facing methods:

```csharp
public interface IReportingService
{
    Task<DashboardSnapshot> GetDashboardAsync(DateOnly localToday,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<FinancialReportRow>> GetFinancialAsync(DateRange range,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<TopBookRow>> GetTopBooksAsync(DateRange range, int limit,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<InventoryRow>> GetStockAsync(bool lowStockOnly,
        CancellationToken cancellationToken);
    Task ExportFinancialAsync(DateRange range, Stream destination,
        CancellationToken cancellationToken);
    Task ExportTopBooksAsync(DateRange range, Stream destination,
        CancellationToken cancellationToken);
    Task ExportStockAsync(bool lowStockOnly, Stream destination,
        CancellationToken cancellationToken);
}

public sealed record UserListItem(int Id, string Username, string DisplayName,
    string RoleName, bool IsActive, DateTime? LastLoginAtUtc, byte[] RowVersion);
public sealed record AuditRow(long Id, DateTime CreatedAtUtc, string Username,
    string Action, string EntityType, string? EntityId, string Summary);

public interface IUserAdministrationService
{
    Task<IReadOnlyList<UserListItem>> SearchAsync(string? text,
        CancellationToken cancellationToken);
    Task<int> CreateAsync(CreateUserRequest request, CancellationToken cancellationToken);
    Task DeactivateAsync(int id, byte[] rowVersion, CancellationToken cancellationToken);
    Task ChangeRoleAsync(int id, string roleName, byte[] rowVersion,
        CancellationToken cancellationToken);
    Task ResetPasswordAsync(int id, string newPassword, byte[] rowVersion,
        CancellationToken cancellationToken);
}

public interface IAuditQueryService
{
    Task<IReadOnlyList<AuditRow>> SearchAsync(AuditQuery query,
        CancellationToken cancellationToken);
}
```

- [ ] **Step 1: Define report contracts and failing aggregation tests**

```csharp
public sealed record DateRange(DateOnly From, DateOnly To)
{
    public void EnsureValid()
    {
        if (From > To) throw new ValidationException("Từ ngày không được sau đến ngày.");
        if (To.DayNumber - From.DayNumber > 366)
            throw new ValidationException("Khoảng thời gian tối đa là 366 ngày.");
    }
}
public sealed record DailyRevenuePoint(DateOnly Date, decimal Revenue);
public sealed record TopBookRow(string Code, string Title, int QuantitySold,
    decimal Revenue);
public sealed record DashboardSnapshot(decimal TodayRevenue, int InvoiceCount,
    int BooksSold, int LowStockCount, IReadOnlyList<DailyRevenuePoint> Revenue7Days,
    IReadOnlyList<TopBookRow> TopFiveBooks);
public sealed record FinancialReportRow(DateOnly Date, int InvoiceCount,
    decimal Revenue, decimal Cost, decimal GrossProfit);
```

```csharp
[Fact]
public async Task FinancialReport_ExcludesCancelledInvoicesAndUsesCostSnapshots()
{
    var fixture = ReportingFixture.WithInvoices(
        completed: (revenue: 300_000m, cost: 180_000m),
        cancelled: (revenue: 90_000m, cost: 50_000m));
    var rows = await fixture.Service.GetFinancialAsync(
        new(new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 2)), default);
    Assert.Equal(300_000m, rows.Sum(x => x.Revenue));
    Assert.Equal(180_000m, rows.Sum(x => x.Cost));
    Assert.Equal(120_000m, rows.Sum(x => x.GrossProfit));
}

[Fact]
public async Task Dashboard_FillsMissingDaysWithZero()
{
    var fixture = ReportingFixture.WithDailyRevenue((new DateOnly(2026, 8, 2), 100_000m));
    var result = await fixture.Service.GetDashboardAsync(new DateOnly(2026, 8, 2), default);
    Assert.Equal(7, result.Revenue7Days.Count);
    Assert.Equal(0m, result.Revenue7Days[0].Revenue);
    Assert.Equal(100_000m, result.Revenue7Days[^1].Revenue);
}
```

- [ ] **Step 2: Run report/export/admin tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "ReportingServiceTests|UserAdministrationTests|Utf8BomCsvExporterTests"`

Expected: FAIL because reporting, administration, and export types do not exist.

- [ ] **Step 3: Implement report queries and UTC date boundaries**

Convert inclusive local `DateOnly` bounds to `[fromUtc, nextDayUtc)` once in the
application layer using `TimeZoneInfo.Local`. All financial and top-book queries
include only `Completed` invoices. Cost is `Quantity * UnitCostSnapshot`; gross profit
(lợi nhuận gộp) is revenue after invoice discount minus cost, with invoice-level discount
distributed across lines proportionally only where line-level grouping requires
it. Dashboard returns seven rows even on no-sale dates and top five is ordered by
quantity then title. Stock reports use current inventory and the exact
`Quantity <= MinimumStockLevel` rule.

- [ ] **Step 4: Implement UTF-8 BOM CSV and test Vietnamese output**

```csharp
[Fact]
public async Task Export_WritesUtf8BomEscapesQuotesAndPreservesVietnamese()
{
    var stream = new MemoryStream();
    var rows = new[] { new ExportRow("Dế Mèn, \"phiêu lưu\"", 120_000m) };
    await new Utf8BomCsvExporter().ExportAsync(rows,
        new[]
        {
            new CsvColumn<ExportRow>("Tên sách", x => x.Title),
            new CsvColumn<ExportRow>("Doanh thu", x => x.Revenue.ToString("0.00", CultureInfo.InvariantCulture))
        }, stream, default);
    var bytes = stream.ToArray();
    Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]);
    var text = Encoding.UTF8.GetString(bytes);
    Assert.Contains("\"Dế Mèn, \"\"phiêu lưu\"\"\"", text);
}
```

Write CRLF rows, quote values containing comma/quote/CR/LF, double embedded
quotes, and leave the destination stream open. Export methods write audit action
`Export` with report type and selected inclusive date range.

- [ ] **Step 5: Implement administrator-only account management and audit search**

```csharp
public sealed record CreateUserRequest(string Username, string DisplayName,
    string RoleName, string InitialPassword);
public sealed record AuditQuery(DateTime? FromUtc, DateTime? ToUtc,
    int? UserId, string? Action, string? Text);
```

Require `ManageUsers` for create/deactivate/role/reset. Enforce unique normalized
username, active known role, password length at least 10, uppercase, lowercase,
digit, and symbol. Prevent administrators from deactivating their own current
account or removing their own Administrator role. Hash resets with a fresh salt.
Require `ViewFullAudit` for unrestricted audit; standard users cannot call audit
search. Audit every administration mutation without storing the password.

- [ ] **Step 6: Verify reports, export, and administration**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "ReportingServiceTests|UserAdministrationTests|Utf8BomCsvExporterTests"`

Expected: PASS for inclusive ranges, local/UTC conversion, cancelled exclusion,
profit, zero-day filling, top five, low stock, Vietnamese CSV, export audit,
password policy, self-protection, and permission checks.

- [ ] **Step 7: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/Abstractions/ICsvExporter.cs BookstorePro/src/BookstorePro.Application/Reporting BookstorePro/src/BookstorePro.Application/Security BookstorePro/src/BookstorePro.Infrastructure/Export BookstorePro/src/BookstorePro.Infrastructure/Services/EfReportingStore.cs BookstorePro/src/BookstorePro.Infrastructure/Services/EfUserAdministrationStore.cs BookstorePro/src/BookstorePro.Infrastructure/Services/EfAuditQueryService.cs BookstorePro/tests/BookstorePro.Tests/Application/ReportingServiceTests.cs BookstorePro/tests/BookstorePro.Tests/Application/UserAdministrationTests.cs BookstorePro/tests/BookstorePro.Tests/Infrastructure/Utf8BomCsvExporterTests.cs
git commit -m "feat: add reporting export and administration"
```

## Task 10: Build MVVM primitives, Executive Navy theme, login, and authorized shell

**Files:**
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/ObservableObject.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/RelayCommand.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/AsyncRelayCommand.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/ValidatingViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/INavigationService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/NavigationService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/IDialogService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/INotificationService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/LoginViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/MainViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/NavigationItem.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/AppScreen.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/LoginWindow.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/LoginWindow.xaml.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/MainWindow.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/MainWindow.xaml.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Resources/Colors.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Resources/Typography.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Resources/Controls.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Resources/DataGrid.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Resources/Dialogs.xaml`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/AsyncRelayCommandTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/LoginViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/MainViewModelTests.cs`

**Interfaces:**
- Consumes: `IAuthenticationService`, `ICurrentSession`, `AuthorizationService`, `Permission`.
- Produces: reusable MVVM base classes; `INavigationService.NavigateAsync(AppScreen, CancellationToken)`; `LoginViewModel`; `MainViewModel`; `INavigationAware.OnNavigatedToAsync(CancellationToken)`.

```csharp
public enum AppScreen
{
    Dashboard, Books, Sales, Inventory, Customers, Suppliers, Reports, Admin
}

public interface INavigationAware
{
    Task OnNavigatedToAsync(CancellationToken cancellationToken);
}

public interface INavigationService
{
    object? CurrentViewModel { get; }
    Task NavigateAsync(AppScreen screen, CancellationToken cancellationToken);
    void OpenShell();
    void OpenLogin();
}
```

- [ ] **Step 1: Write failing command and login ViewModel tests**

```csharp
[Fact]
public async Task AsyncCommand_DisablesItselfAndIgnoresSecondExecution()
{
    var gate = new TaskCompletionSource();
    var calls = 0;
    var command = new AsyncRelayCommand(async _ => { calls++; await gate.Task; });
    var first = command.ExecuteAsync(null);
    var second = command.ExecuteAsync(null);
    Assert.False(command.CanExecute(null));
    gate.SetResult();
    await Task.WhenAll(first, second);
    Assert.Equal(1, calls);
    Assert.True(command.CanExecute(null));
}

[Fact]
public async Task Login_SuccessBeginsSessionAndOpensShell()
{
    var fixture = LoginViewModelFixture.SuccessfulAdministrator();
    fixture.ViewModel.Username = "admin";
    fixture.ViewModel.Password = fixture.ValidPassword;
    await fixture.ViewModel.SignInCommand.ExecuteAsync(null);
    Assert.Equal("admin", fixture.Session.User!.Username);
    Assert.True(fixture.Navigation.ShellOpened);
    Assert.Equal(string.Empty, fixture.ViewModel.Password);
}
```

- [ ] **Step 2: Run WPF foundation tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "AsyncRelayCommandTests|LoginViewModelTests|MainViewModelTests"`

Expected: FAIL because the MVVM and shell types do not exist.

- [ ] **Step 3: Implement observable, validation, and command primitives**

`ObservableObject` implements `INotifyPropertyChanged` with `SetProperty<T>`.
`ValidatingViewModel` implements `INotifyDataErrorInfo` and stores one or more
Vietnamese messages per property. `AsyncRelayCommand` exposes `IsRunning`,
disables itself during execution, observes exceptions through a supplied
`Func<Exception, Task>`, and supports cancellation. No service locator or
`async void` is used except WPF's `ICommand.Execute` adapter.

- [ ] **Step 4: Define Executive Navy resources and shell layout**

Use these exact resource tokens:

```xml
<Color x:Key="Navy900">#10233F</Color>
<Color x:Key="Navy800">#173554</Color>
<Color x:Key="Blue600">#2563EB</Color>
<Color x:Key="Amber500">#F59E0B</Color>
<Color x:Key="Surface">#FFFFFF</Color>
<Color x:Key="Canvas">#F4F7FB</Color>
<Color x:Key="TextPrimary">#172033</Color>
<Color x:Key="TextSecondary">#64748B</Color>
<Color x:Key="Danger600">#DC2626</Color>
<Color x:Key="Success600">#16A34A</Color>
<FontFamily x:Key="AppFont">Segoe UI Variable, Segoe UI</FontFamily>
<sys:Double x:Key="Space1">8</sys:Double>
<sys:Double x:Key="Space2">16</sys:Double>
<sys:Double x:Key="Space3">24</sys:Double>
<sys:Double x:Key="Space4">32</sys:Double>
```

`MainWindow` uses a 232-pixel navy rail, a 64-pixel top bar, and a flexible
content presenter. Set `MinWidth="1180"`, `MinHeight="680"`, initial
`Width="1366"`, `Height="768"`, and `WindowStartupLocation="CenterScreen"`.
Every interactive style defines mouse, disabled, validation-error, and keyboard
focus states. Buttons have at least 36-pixel height; body text is at least 13px.

- [ ] **Step 5: Implement login and role-filtered navigation**

Login validates non-blank username/password inline. On a delayed result it shows
the server-provided remaining seconds and disables submit until the local timer
expires. It clears password on every result. Successful login begins the session
and swaps to the shell.

The shell has these exact items and permission gates:

```csharp
new("Tổng quan", AppScreen.Dashboard, Permission.ViewDashboard),
new("Sách", AppScreen.Books, Permission.ViewCatalog),
new("Bán hàng", AppScreen.Sales, Permission.CreateSale),
new("Kho", AppScreen.Inventory, Permission.ViewInventory),
new("Khách hàng", AppScreen.Customers, Permission.ManageCustomers),
new("Nhà cung cấp", AppScreen.Suppliers, Permission.PostStockReceipt),
new("Báo cáo", AppScreen.Reports, Permission.ViewStandardReports),
new("Quản trị", AppScreen.Admin, Permission.ManageUsers)
```

Logout clears session and returns to login. Navigation cancels the previous
screen load and calls the new ViewModel's `OnNavigatedToAsync` exactly once.

- [ ] **Step 6: Add authorization and error-state ViewModel tests**

```csharp
[Fact]
public void Main_StaffCannotSeeAdministration()
{
    var fixture = MainViewModelFixture.Create(role: RoleNames.Staff);
    Assert.DoesNotContain(fixture.ViewModel.Items, x => x.Label == "Quản trị");
    Assert.Contains(fixture.ViewModel.Items, x => x.Label == "Bán hàng");
}

[Fact]
public async Task Login_FailureShowsSafeMessageAndNeverExposesExceptionText()
{
    var fixture = LoginViewModelFixture.Failed("Tên đăng nhập hoặc mật khẩu không đúng.");
    fixture.ViewModel.Username = "admin";
    fixture.ViewModel.Password = "wrong";
    await fixture.ViewModel.SignInCommand.ExecuteAsync(null);
    Assert.Equal("Tên đăng nhập hoặc mật khẩu không đúng.", fixture.ViewModel.ErrorMessage);
    Assert.DoesNotContain("stack", fixture.ViewModel.ErrorMessage, StringComparison.OrdinalIgnoreCase);
}
```

- [ ] **Step 7: Verify foundation UI behavior**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "AsyncRelayCommandTests|LoginViewModelTests|MainViewModelTests"`

Expected: PASS for duplicate-command prevention, loading state, validation,
success/failure/delay login, logout, navigation cancellation, and role filtering.

Run: `dotnet build BookstorePro.sln -c Release`

Expected: WPF XAML compiles with zero warnings and zero errors.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Wpf/ViewModels BookstorePro/src/BookstorePro.Wpf/Services BookstorePro/src/BookstorePro.Wpf/Views/LoginWindow.xaml BookstorePro/src/BookstorePro.Wpf/Views/LoginWindow.xaml.cs BookstorePro/src/BookstorePro.Wpf/Views/MainWindow.xaml BookstorePro/src/BookstorePro.Wpf/Views/MainWindow.xaml.cs BookstorePro/src/BookstorePro.Wpf/Resources BookstorePro/tests/BookstorePro.Tests/Wpf
git commit -m "feat: add themed authorized WPF shell"
```

## Task 11: Build catalog, customer, and supplier WPF screens

**Files:**
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/Debouncer.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/BooksViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/EditBookViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/ReferenceDataViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/CustomersViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/EditCustomerViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/CustomerDetailsViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/SuppliersViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/EditSupplierViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/BooksView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/EditBookDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/ReferenceDataDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/CustomersView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/EditCustomerDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/CustomerDetailsDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/SuppliersView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/EditSupplierDialog.xaml`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/BooksViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/EditBookViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/CustomersViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/SuppliersViewModelTests.cs`

**Interfaces:**
- Consumes: `IBookService`, `IReferenceDataService`, `ICustomerService`, `ISupplierService`, dialogs, notifications, canonical DTOs from Tasks 5–6.
- Produces: searchable grids, modal add/edit flows, safe deactivation, customer purchase details, and concurrency reload prompts.

- [ ] **Step 1: Write failing screen-state tests**

```csharp
[Fact]
public async Task Books_SearchChange_CancelsPriorRequestAndLoadsLatestRows()
{
    var fixture = BooksViewModelFixture.Create();
    fixture.ViewModel.SearchText = "Dế";
    fixture.ViewModel.SearchText = "Tô Hoài";
    await fixture.Debouncer.FlushAsync();
    Assert.Equal("Tô Hoài", fixture.BookService.LastQuery!.Text);
    Assert.True(fixture.BookService.FirstRequestWasCancelled);
}

[Fact]
public async Task EditBook_SaveWithInvalidFields_StaysOpenAndShowsInlineErrors()
{
    var fixture = EditBookViewModelFixture.Create();
    fixture.ViewModel.Title = "";
    fixture.ViewModel.SelectedAuthorIds.Clear();
    await fixture.ViewModel.SaveCommand.ExecuteAsync(null);
    Assert.True(fixture.ViewModel.HasErrors);
    Assert.False(fixture.Dialog.CloseRequested);
    Assert.Equal(0, fixture.BookService.SaveCalls);
}
```

- [ ] **Step 2: Run master-screen tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "BooksViewModelTests|EditBookViewModelTests|CustomersViewModelTests|SuppliersViewModelTests"`

Expected: FAIL because the screen ViewModels do not exist.

- [ ] **Step 3: Implement list-screen behavior**

Use a cancellable 300ms `Debouncer` for text search. Expose `IsLoading`,
`ErrorMessage`, `ObservableCollection<T> Items`, selection, filters, and commands.
Each list loads in `OnNavigatedToAsync`. An empty result shows
`"Không tìm thấy dữ liệu phù hợp."`; a failed load preserves the filter and
shows a retry command. DataGrids use explicit columns, sortable headers,
virtualization, alternating rows, fixed action-column width, and status badges.

Screen composition:

- Sách: title/search row; field/category/publisher filters; `Thêm sách`; grid
  columns Mã, Tên sách, Tác giả, Lĩnh vực, Thể loại, NXB, Giá bán, Tồn, Trạng
  thái, actions.
- Khách hàng: search; `Thêm khách hàng`; code/name/phone/email/status/actions;
  double-click opens purchase details with completed/cancelled badges and total
  spending.
- Nhà cung cấp: search; `Thêm nhà cung cấp`; code/name/phone/email/status/actions.

- [ ] **Step 4: Implement modal editing and concurrency recovery**

Book dialog uses a two-column form, searchable multi-select authors, dependent
category filter, `DatePicker`, numeric inputs, and inline messages. Customer and
supplier dialogs normalize optional fields before calling services. Save stays
disabled while running. On success, close once, refresh the list, and publish a
brief success notification.

For Staff, the Sách screen is search-only: omit add, edit, deactivate, and
reference-data actions. Customer actions remain available. Supplier and receipt
actions are available through `PostStockReceipt`; inventory adjustment stays
Administrator-only.

Map `DbUpdateConcurrencyException` through the application exception type to a
dialog with exact actions `Tải lại dữ liệu` and `Hủy chỉnh sửa`. Choosing reload
fetches the latest DTO and replaces the local `RowVersion`; it never overwrites
the database silently.

- [ ] **Step 5: Add success, deactivate, and concurrency tests**

```csharp
[Fact]
public async Task SaveBook_SuccessClosesRefreshesAndNotifiesOnce()
{
    var fixture = EditBookViewModelFixture.Valid();
    await fixture.ViewModel.SaveCommand.ExecuteAsync(null);
    Assert.True(fixture.Dialog.CloseRequested);
    Assert.Equal(1, fixture.Parent.RefreshCalls);
    Assert.Equal("Đã lưu sách.", fixture.Notifications.Messages.Single());
}

[Fact]
public async Task DeactivateCustomer_RequiresExplicitConfirmation()
{
    var fixture = CustomersViewModelFixture.WithSelection(confirm: false);
    await fixture.ViewModel.DeactivateCommand.ExecuteAsync(null);
    Assert.Equal(0, fixture.CustomerService.DeactivateCalls);
}

[Fact]
public async Task ConcurrencyConflict_ReloadChoiceReplacesRowVersion()
{
    var fixture = EditBookViewModelFixture.WithConcurrencyConflict(
        latestVersion: new byte[] { 9, 9 });
    await fixture.ViewModel.SaveCommand.ExecuteAsync(null);
    Assert.Equal(new byte[] { 9, 9 }, fixture.ViewModel.RowVersion);
    Assert.False(fixture.Dialog.CloseRequested);
}
```

- [ ] **Step 6: Verify master-data UI**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "BooksViewModelTests|EditBookViewModelTests|CustomersViewModelTests|SuppliersViewModelTests"`

Expected: PASS for load/search/filter, cancellation, validation, create/update,
deactivate confirmation, purchase detail, loading state, notifications, and
concurrency recovery.

Run: `dotnet build BookstorePro.sln -c Release`

Expected: all XAML compiles with zero warnings and zero errors.

- [ ] **Step 7: Commit**

```bash
git add BookstorePro/src/BookstorePro.Wpf/Services/Debouncer.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/BooksViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/EditBookViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/ReferenceDataViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/CustomersViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/EditCustomerViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/CustomerDetailsViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/SuppliersViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/EditSupplierViewModel.cs BookstorePro/src/BookstorePro.Wpf/Views BookstorePro/tests/BookstorePro.Tests/Wpf
git commit -m "feat: add master-data WPF screens"
```

## Task 12: Build inventory, receipt-posting, and adjustment WPF screens

**Files:**
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/InventoryViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/StockMovementsViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/PostReceiptViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/ReceiptLineViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/AdjustInventoryViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/InventoryView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/StockMovementsDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/PostReceiptDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/AdjustInventoryDialog.xaml`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/InventoryViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/PostReceiptViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/AdjustInventoryViewModelTests.cs`

**Interfaces:**
- Consumes: `IInventoryService`, `IBookService`, `ISupplierService`, `ICurrentSession`, `AuthorizationService`, dialog/notification services.
- Produces: inventory search/low-stock filter, movement history, draft receipt editor, administrator-only adjustment dialog.

- [ ] **Step 1: Write failing receipt-editor tests**

```csharp
[Fact]
public void AddSameBookAgain_IncreasesDraftQuantityInsteadOfDuplicatingRow()
{
    var fixture = PostReceiptViewModelFixture.Create();
    fixture.ViewModel.AddBook(fixture.Book, quantity: 2, unitCost: 60_000m);
    fixture.ViewModel.AddBook(fixture.Book, quantity: 3, unitCost: 62_000m);
    var line = Assert.Single(fixture.ViewModel.Lines);
    Assert.Equal(5, line.Quantity);
    Assert.Equal(62_000m, line.UnitCost);
}

[Fact]
public async Task Post_WhenServiceFails_KeepsDraftForCorrection()
{
    var fixture = PostReceiptViewModelFixture.Failing("Không thể kết nối SQL Server.");
    fixture.ViewModel.AddValidLine();
    await fixture.ViewModel.PostCommand.ExecuteAsync(null);
    Assert.Single(fixture.ViewModel.Lines);
    Assert.Equal("Không thể kết nối SQL Server.", fixture.ViewModel.ErrorMessage);
}
```

- [ ] **Step 2: Run inventory UI tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "InventoryViewModelTests|PostReceiptViewModelTests|AdjustInventoryViewModelTests"`

Expected: FAIL because the inventory ViewModels do not exist.

- [ ] **Step 3: Implement inventory list and movement history**

Use search plus `Chỉ sắp hết` toggle. Show code, title, current quantity, minimum,
and colored state: red `Hết hàng` when 0, amber `Sắp hết` when positive and at or
below minimum, green `Còn hàng` otherwise. Row commands open immutable movement
history newest first. The `Điều chỉnh` action is omitted for Staff rather than
shown as a nonfunctional button.

- [ ] **Step 4: Implement receipt draft and posting dialog**

Layout uses supplier/date/note at top, searchable book picker, editable line
grid, and sticky total/footer. `ReceiptLineViewModel` validates quantity as a
positive integer and cost as non-negative decimal. Adding the same book merges
quantity and uses the latest entered unit cost. Post requires confirmation with
line count and total cost. Clear/close only after committed success; then show
the generated receipt code and refresh inventory.

- [ ] **Step 5: Implement administrator adjustment dialog**

Show read-only current quantity and required counted quantity/reason. Display the
calculated delta before enabling submit. Require confirmation for any nonzero
delta. On a concurrency conflict, offer reload; on success, close and refresh.

- [ ] **Step 6: Add role, calculation, and submission-state tests**

```csharp
[Fact]
public void Inventory_StaffHasNoAdjustmentCommand()
{
    var fixture = InventoryViewModelFixture.CreateAsStaff();
    Assert.Null(fixture.ViewModel.AdjustCommand);
}

[Fact]
public void ReceiptTotal_UsesQuantityTimesCostForEveryLine()
{
    var fixture = PostReceiptViewModelFixture.Create();
    fixture.ViewModel.AddBook(fixture.Book1, 2, 50_000m);
    fixture.ViewModel.AddBook(fixture.Book2, 3, 40_000m);
    Assert.Equal(220_000m, fixture.ViewModel.TotalCost);
}

[Fact]
public async Task Post_DoubleInvocationCallsServiceOnce()
{
    var fixture = PostReceiptViewModelFixture.WithBlockingService();
    fixture.ViewModel.AddValidLine();
    var first = fixture.ViewModel.PostCommand.ExecuteAsync(null);
    var second = fixture.ViewModel.PostCommand.ExecuteAsync(null);
    fixture.Service.Release();
    await Task.WhenAll(first, second);
    Assert.Equal(1, fixture.Service.PostCalls);
}
```

- [ ] **Step 7: Verify inventory UI**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "InventoryViewModelTests|PostReceiptViewModelTests|AdjustInventoryViewModelTests"`

Expected: PASS for low-stock states, history, role visibility, line merging,
totals, validation, confirmation, failure preservation, duplicate prevention,
success refresh, and concurrency reload.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Wpf/ViewModels/InventoryViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/StockMovementsViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/PostReceiptViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/ReceiptLineViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/AdjustInventoryViewModel.cs BookstorePro/src/BookstorePro.Wpf/Views/InventoryView.xaml BookstorePro/src/BookstorePro.Wpf/Views/StockMovementsDialog.xaml BookstorePro/src/BookstorePro.Wpf/Views/PostReceiptDialog.xaml BookstorePro/src/BookstorePro.Wpf/Views/AdjustInventoryDialog.xaml BookstorePro/tests/BookstorePro.Tests/Wpf
git commit -m "feat: add inventory and receipt WPF flows"
```

## Task 13: Build the A1 Split POS, invoice management, and receipt printing

**Files:**
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/SalesViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/CartLineViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/InvoiceHistoryViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/InvoiceDetailsViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/CancelInvoiceViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/IReceiptPrintService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/FlowDocumentReceiptPrintService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/SalesView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/InvoiceHistoryDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/InvoiceDetailsDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/CancelInvoiceDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/Print/ReceiptDocument.xaml`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/SalesViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/InvoiceViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/ReceiptDocumentTests.cs`

**Interfaces:**
- Consumes: `IBookService`, `ICustomerService`, `ICheckoutService`, `ICurrentSession`, `AuthorizationService`, dialogs, notifications.
- Produces: in-memory POS cart; checkout/cancel ViewModels; `IReceiptPrintService.Print(InvoiceDetails, PrintDialog)` and `CreateDocument(InvoiceDetails)`.

- [ ] **Step 1: Write failing cart and checkout-state tests**

```csharp
[Fact]
public void AddSameBook_MergesLineAndNeverExceedsDisplayedAvailability()
{
    var fixture = SalesViewModelFixture.WithBook(available: 3, price: 100_000m);
    fixture.ViewModel.AddBookCommand.Execute(fixture.Book);
    fixture.ViewModel.AddBookCommand.Execute(fixture.Book);
    var line = Assert.Single(fixture.ViewModel.Cart);
    Assert.Equal(2, line.Quantity);
    line.Quantity = 4;
    Assert.Equal(3, line.Quantity);
    Assert.Equal("Số lượng tối đa hiện có là 3.", line.ErrorMessage);
}

[Fact]
public async Task Checkout_SuccessClearsCartOnlyAfterServiceReturns()
{
    var fixture = SalesViewModelFixture.WithBlockingSuccessfulCheckout();
    fixture.ViewModel.AddBookCommand.Execute(fixture.Book);
    var task = fixture.ViewModel.CheckoutCommand.ExecuteAsync(null);
    Assert.Single(fixture.ViewModel.Cart);
    fixture.Checkout.ReleaseSuccess();
    await task;
    Assert.Empty(fixture.ViewModel.Cart);
    Assert.True(fixture.ViewModel.CanPrintLastInvoice);
}
```

- [ ] **Step 2: Run POS tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "SalesViewModelTests|InvoiceViewModelTests|ReceiptDocumentTests"`

Expected: FAIL because POS, invoice, and print types do not exist.

- [ ] **Step 3: Implement the A1 Split POS layout and cart**

Use a `Grid` with 58% catalog/42% cart at widths above 1280 and 52%/48% at the
minimum supported width. The left pane contains search, category filter, and
virtualized book cards/rows showing availability. The right pane remains visible
and contains customer selector, cart grid, discount, subtotal, discount amount,
total, payment method, and a full-width `Thanh toán` button.

Cart mutations are in memory only. Adding a repeated book increments the line;
quantity is clamped to 1..displayed availability; removing the last item updates
totals. Recalculate from decimal line values on every change. Staff discount input
has maximum 10; Administrator maximum 30. The service still revalidates every
value against SQL Server during checkout.

- [ ] **Step 4: Implement checkout confirmation and failure preservation**

Before calling the service, show customer/walk-in, item count, subtotal,
discount, total, and payment method. While running, disable every cart mutation.
On validation or stock conflict, keep the cart, show the safe Vietnamese message,
and refresh catalog availability. On success, store returned invoice ID/code,
clear the cart, refresh availability, show `Thanh toán thành công: {code}`, and
offer `In hóa đơn`.

- [ ] **Step 5: Implement invoice history, cancellation, and `FlowDocument` printing**

History filters by code, inclusive date range, and status. Details show immutable
original data and cancellation metadata. Cancellation dialog requires reason and
confirmation; success refreshes the row and inventory-facing catalog.

`CreateDocument` returns an A5 portrait `FlowDocument` with bookstore title,
invoice code, local sold time, seller, optional customer, item table, subtotal,
discount, total, payment method, and thank-you footer. Use `Paginator.PageSize =
new Size(559, 794)` in device-independent units and never print password or
internal database IDs.

- [ ] **Step 6: Add cancellation, price-refresh, and print-content tests**

```csharp
[Fact]
public async Task Checkout_StockConflictKeepsCartAndRefreshesAvailability()
{
    var fixture = SalesViewModelFixture.WithCheckoutFailure("Số lượng tồn kho không đủ.");
    fixture.ViewModel.AddBookCommand.Execute(fixture.Book);
    await fixture.ViewModel.CheckoutCommand.ExecuteAsync(null);
    Assert.Single(fixture.ViewModel.Cart);
    Assert.Equal(1, fixture.BookService.RefreshCalls);
}

[Fact]
public async Task Cancel_RequiresReasonBeforeServiceCall()
{
    var fixture = InvoiceViewModelFixture.Create();
    fixture.CancelViewModel.Reason = " ";
    await fixture.CancelViewModel.ConfirmCommand.ExecuteAsync(null);
    Assert.Equal(0, fixture.CheckoutService.CancelCalls);
    Assert.True(fixture.CancelViewModel.HasErrors);
}

[Fact]
public void ReceiptDocument_ContainsVisibleBusinessValuesOnly()
{
    var details = InvoiceFixture.ValidDetails();
    var document = new FlowDocumentReceiptPrintService().CreateDocument(details);
    var text = new TextRange(document.ContentStart, document.ContentEnd).Text;
    Assert.Contains(details.Code, text);
    Assert.Contains("Tổng thanh toán", text);
    Assert.DoesNotContain("Password", text, StringComparison.OrdinalIgnoreCase);
}
```

- [ ] **Step 7: Verify POS and invoice UI**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "SalesViewModelTests|InvoiceViewModelTests|ReceiptDocumentTests"`

Expected: PASS for cart merging, quantity bounds, totals, role discounts,
double-submit prevention, success clearing, failure preservation, invoice filters,
cancellation, and print content.

Run: `dotnet build BookstorePro.sln -c Release`

Expected: A1 Split POS XAML and print template compile with zero errors.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Wpf/ViewModels/SalesViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/CartLineViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/InvoiceHistoryViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/InvoiceDetailsViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/CancelInvoiceViewModel.cs BookstorePro/src/BookstorePro.Wpf/Services/IReceiptPrintService.cs BookstorePro/src/BookstorePro.Wpf/Services/FlowDocumentReceiptPrintService.cs BookstorePro/src/BookstorePro.Wpf/Views/SalesView.xaml BookstorePro/src/BookstorePro.Wpf/Views/InvoiceHistoryDialog.xaml BookstorePro/src/BookstorePro.Wpf/Views/InvoiceDetailsDialog.xaml BookstorePro/src/BookstorePro.Wpf/Views/CancelInvoiceDialog.xaml BookstorePro/src/BookstorePro.Wpf/Views/Print BookstorePro/tests/BookstorePro.Tests/Wpf
git commit -m "feat: add split POS and invoice printing"
```

## Task 14: Build dashboard, report, export, and administration WPF screens

**Files:**
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/DashboardViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/ReportsViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/AdminViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/EditUserViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/AuditLogViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/IFileSaveService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/FileSaveService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Converters/LocalDateTimeConverter.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/DashboardView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/ReportsView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/AdminView.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/EditUserDialog.xaml`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/AuditLogView.xaml`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/DashboardViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/ReportsViewModelTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/AdminViewModelTests.cs`

**Interfaces:**
- Consumes: `IReportingService`, `IUserAdministrationService`, `IAuditQueryService`, `ICsvExporter`, `IFileSaveService`, `INavigationService`.
- Produces: KPI/chart dashboard, validated report filters and exports, account management, and full audit viewer.

- [ ] **Step 1: Write failing dashboard and export tests**

```csharp
[Fact]
public async Task Dashboard_LoadMapsExactlySevenChartPointsAndFiveOrFewerBooks()
{
    var fixture = DashboardViewModelFixture.Create(days: 7, topBooks: 8);
    await fixture.ViewModel.OnNavigatedToAsync(default);
    Assert.Equal(7, fixture.ViewModel.RevenueSeriesValues.Count);
    Assert.Equal(5, fixture.ViewModel.TopBooks.Count);
}

[Fact]
public async Task ReportExport_UserCancelsFileDialog_DoesNotExportOrAudit()
{
    var fixture = ReportsViewModelFixture.Create(savePath: null);
    await fixture.ViewModel.ExportCommand.ExecuteAsync(null);
    Assert.Equal(0, fixture.ReportingService.ExportCalls);
}
```

- [ ] **Step 2: Run dashboard/report/admin tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "DashboardViewModelTests|ReportsViewModelTests|AdminViewModelTests"`

Expected: FAIL because the screen ViewModels do not exist.

- [ ] **Step 3: Implement dashboard KPIs and restrained charts**

Top row uses four KPI cards: `Doanh thu hôm nay`, `Hóa đơn`, `Sách đã bán`, and
`Sắp hết hàng`. Below it, a LiveChartsCore line chart shows seven days with
currency axis formatting and no animation longer than 250ms; a ranked table shows
top five books. A primary `Tạo đơn mới` action navigates to `AppScreen.Sales`.
Empty data renders zero-valued KPIs and a clear empty state without treating it
as an error.

- [ ] **Step 4: Implement report tabs and safe export**

Provide tabs `Tài chính`, `Sách bán chạy`, and `Tồn kho`. Financial/top-book tabs
use required From/To date controls initialized to the current month. Validate the
inclusive range before service calls. The stock tab has current/all and low-stock
filter. Export uses `SaveFileDialog` with `.csv`; it uses `FileMode.CreateNew`
when the path is absent and, when the path exists, opens `FileMode.Create` only
after an explicit overwrite confirmation. It then calls the application export
method and notifies the final path.

- [ ] **Step 5: Implement administration and audit views**

Accounts grid shows username, display name, role, active state, and last local
login. Create/edit/reset flows use inline validation and destructive
confirmations. Disable self-deactivate and own-role-change actions in the UI in
addition to application checks. Audit view filters by inclusive time, user,
action, and text, then shows time, user, action, entity, and summary; it never
shows credential or connection-string columns.

- [ ] **Step 6: Add UI-state, role, and local-time tests**

```csharp
[Fact]
public async Task Reports_InvalidRangeShowsValidationWithoutCallingService()
{
    var fixture = ReportsViewModelFixture.Create();
    fixture.ViewModel.From = new DateOnly(2026, 8, 3);
    fixture.ViewModel.To = new DateOnly(2026, 8, 2);
    await fixture.ViewModel.LoadCommand.ExecuteAsync(null);
    Assert.Equal("Từ ngày không được sau đến ngày.", fixture.ViewModel.DateError);
    Assert.Equal(0, fixture.ReportingService.LoadCalls);
}

[Fact]
public void Admin_CurrentAdministratorCannotSelectOwnDeactivateAction()
{
    var fixture = AdminViewModelFixture.WithCurrentUserSelected();
    Assert.False(fixture.ViewModel.DeactivateCommand.CanExecute(null));
}

[Fact]
public void LocalDateConverter_ConvertsUtcWithoutChangingStoredValue()
{
    var utc = new DateTime(2026, 8, 2, 3, 0, 0, DateTimeKind.Utc);
    var local = (DateTime)new LocalDateTimeConverter().Convert(
        utc, typeof(DateTime), null!, CultureInfo.GetCultureInfo("vi-VN"));
    Assert.Equal(utc.ToLocalTime(), local);
    Assert.Equal(DateTimeKind.Utc, utc.Kind);
}
```

- [ ] **Step 7: Verify dashboard, reports, and administration UI**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "DashboardViewModelTests|ReportsViewModelTests|AdminViewModelTests"`

Expected: PASS for KPI/chart mapping, empty data, quick navigation, date
validation, tab loading, cancelled/successful export, role/self restrictions,
audit filtering, and UTC/local display conversion.

Run: `dotnet build BookstorePro.sln -c Release`

Expected: LiveChartsCore and all screens compile with zero warnings/errors.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Wpf/ViewModels/DashboardViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/ReportsViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/AdminViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/EditUserViewModel.cs BookstorePro/src/BookstorePro.Wpf/ViewModels/AuditLogViewModel.cs BookstorePro/src/BookstorePro.Wpf/Services/IFileSaveService.cs BookstorePro/src/BookstorePro.Wpf/Services/FileSaveService.cs BookstorePro/src/BookstorePro.Wpf/Converters BookstorePro/src/BookstorePro.Wpf/Views/DashboardView.xaml BookstorePro/src/BookstorePro.Wpf/Views/ReportsView.xaml BookstorePro/src/BookstorePro.Wpf/Views/AdminView.xaml BookstorePro/src/BookstorePro.Wpf/Views/EditUserDialog.xaml BookstorePro/src/BookstorePro.Wpf/Views/AuditLogView.xaml BookstorePro/tests/BookstorePro.Tests/Wpf
git commit -m "feat: add dashboard reports and administration UI"
```

## Task 15: Wire dependency injection, resilient startup, safe logging, and clean-machine setup

**Files:**
- Create: `BookstorePro/src/BookstorePro.Application/DependencyInjection.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/DependencyInjection.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Logging/RollingFileLoggerOptions.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Logging/RollingFileLoggerProvider.cs`
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Logging/LogRedactor.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/IExceptionMessageMapper.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/VietnameseExceptionMessageMapper.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/IStartupService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Services/StartupService.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/DependencyInjection.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/ViewModels/ConnectionRecoveryViewModel.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/Views/ConnectionRecoveryWindow.xaml`
- Modify: `BookstorePro/src/BookstorePro.Wpf/App.xaml`
- Modify: `BookstorePro/src/BookstorePro.Wpf/App.xaml.cs`
- Create: `BookstorePro/src/BookstorePro.Wpf/appsettings.json`
- Create: `BookstorePro/src/BookstorePro.Wpf/appsettings.example.json`
- Create: `BookstorePro/scripts/setup-database.ps1`
- Modify: `BookstorePro/database/BookstorePro.sql`
- Test: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/LogRedactorTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/RollingFileLoggerTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/ExceptionMessageMapperTests.cs`
- Test: `BookstorePro/tests/BookstorePro.Tests/Wpf/ConnectionRecoveryViewModelTests.cs`

**Interfaces:**
- Consumes: every Application interface/implementation, EF `BookstoreDbContext`, WPF ViewModels, migrations, `DatabaseSeeder`.
- Produces: `ApplicationServiceCollectionExtensions.AddBookstoreApplication(IServiceCollection)`; `InfrastructureServiceCollectionExtensions.AddBookstoreInfrastructure(IServiceCollection, IConfiguration)`; `IStartupService.InitializeAsync(CancellationToken)`; safe logging; retryable startup.

- [ ] **Step 1: Write failing error-boundary and redaction tests**

```csharp
[Theory]
[InlineData("Server=.;User Id=sa;Password=S3cret!;Database=BookstorePro",
    "Server=.;User Id=[REDACTED];Password=[REDACTED];Database=BookstorePro")]
[InlineData("password=S3cret!", "password=[REDACTED]")]
[InlineData("PasswordHash=AQID;PasswordSalt=BAUG", "PasswordHash=[REDACTED];PasswordSalt=[REDACTED]")]
public void Redact_RemovesCredentialMaterial(string input, string expected) =>
    Assert.Equal(expected, LogRedactor.Redact(input));

[Fact]
public void Mapper_ConcurrencyExceptionOffersReloadWithoutStackTrace()
{
    var result = new VietnameseExceptionMessageMapper().Map(
        new DataConcurrencyException("internal"), Guid.Parse("11111111-1111-1111-1111-111111111111"));
    Assert.Equal("Dữ liệu đã được người khác thay đổi. Hãy tải lại và thử lại. (Mã lỗi: 11111111)", result);
    Assert.DoesNotContain("internal", result);
}

[Fact]
public async Task Recovery_RetrySuccessOpensLogin()
{
    var fixture = ConnectionRecoveryFixture.FailOnceThenSucceed();
    await fixture.ViewModel.RetryCommand.ExecuteAsync(null);
    Assert.True(fixture.Navigation.LoginOpened);
    Assert.Null(fixture.ViewModel.ErrorMessage);
}
```

- [ ] **Step 2: Run startup/logging tests to verify they fail**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "LogRedactorTests|RollingFileLoggerTests|ExceptionMessageMapperTests|ConnectionRecoveryViewModelTests"`

Expected: FAIL because the logging and startup types do not exist.

- [ ] **Step 3: Register every dependency with explicit lifetimes**

Register `BookstoreDbContext` as scoped, EF-backed stores/services as scoped,
application services as scoped, `IClock` and `ICurrentSession` as singleton,
ViewModels as transient, and shell/navigation/dialog/notification/print/file-save
services as singleton where they own WPF window state. Create a new DI scope for
each login session and dispose it on logout. Validate the provider at startup:

```csharp
Host.CreateDefaultBuilder()
    .UseDefaultServiceProvider((_, options) =>
    {
        options.ValidateScopes = true;
        options.ValidateOnBuild = true;
    })
    .ConfigureServices((context, services) =>
    {
        services.AddBookstoreApplication();
        services.AddBookstoreInfrastructure(context.Configuration);
        services.AddBookstoreWpf();
    })
    .Build();
```

The real host is built once in `App.OnStartup`. `App.OnExit` awaits host stop and
disposal. `App.xaml` has no `StartupUri`; startup selects recovery, login, or main
window through services.

- [ ] **Step 4: Implement configuration and connection initialization**

Load configuration in this order: `appsettings.json`, optional
`appsettings.Local.json`, then environment variables prefixed `BOOKSTOREPRO_`.
Safe defaults:

```json
{
  "ConnectionStrings": { "BookstorePro": "" },
  "Database": { "ApplyMigrationsOnStartup": true },
  "Logging": { "Directory": "logs", "MaxFileBytes": 5242880, "RetainedFiles": 5 }
}
```

`appsettings.example.json` uses
`Server=.\\SQLEXPRESS;Database=BookstorePro;Trusted_Connection=True;TrustServerCertificate=True`
and contains no secret. If the resolved connection string is blank or connection,
migration, or seed fails, log the correlation ID and show the recovery window
with retry and a short path to `HUONG_DAN_CAI_DAT.md`. Do not terminate the
process or show a stack trace.

- [ ] **Step 5: Implement redacting rolling file logs and global exception handling**

Write UTF-8 daily files under `logs/bookstorepro-YYYYMMDD.log`; rotate at
5,242,880 bytes and retain the five newest files. Each line contains UTC ISO-8601
time, level, category, correlation ID, redacted message, and redacted exception.
Apply `LogRedactor` to both message and exception text. Protect logger writes with
a process-local lock and never throw logger failures back into business logic.

Handle `Application.DispatcherUnhandledException`, `TaskScheduler.UnobservedTaskException`,
and `AppDomain.CurrentDomain.UnhandledException`. For recoverable dispatcher
exceptions, log then display the mapped Vietnamese message and set `Handled =
true`; for a corrupting/fatal exception, log synchronously, show a controlled
shutdown message, and exit.

- [ ] **Step 6: Implement idempotent Windows setup helper**

`setup-database.ps1` accepts:

```powershell
param(
  [string]$ServerInstance = '.\SQLEXPRESS',
  [string]$DatabaseName = 'BookstorePro',
  [ValidateSet('Windows','Sql')][string]$Authentication = 'Windows',
  [string]$SqlUsername,
  [SecureString]$SqlPassword
)
```

It verifies `dotnet --list-sdks` contains 8.x, confirms `sqlcmd` or uses EF Core
for the connection test, constructs the connection string without printing the
password, writes `src/BookstorePro.Wpf/appsettings.Local.json`, applies migrations,
runs the idempotent seed, tests both role rows and account rows, and prints the
launch command. A second run performs no duplicate inserts and exits 0.

Keep `database/BookstorePro.sql` idempotent with EF migration history guards. Its
header states SQL Server 2019+, UTF-8 file encoding, target database name, and the
equivalent PowerShell setup command.

- [ ] **Step 7: Verify logger rotation, mappings, retry, and build**

Run: `dotnet test tests/BookstorePro.Tests/BookstorePro.Tests.csproj -c Release --filter "LogRedactorTests|RollingFileLoggerTests|ExceptionMessageMapperTests|ConnectionRecoveryViewModelTests"`

Expected: PASS for credential redaction regardless of case, size rotation,
retention, safe Vietnamese messages, correlation IDs, retry state, and duplicate
retry prevention.

Run: `dotnet build BookstorePro.sln -c Release`

Expected: dependency validation code, configuration files, and XAML compile with
zero warnings and zero errors.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Application/DependencyInjection.cs BookstorePro/src/BookstorePro.Infrastructure/DependencyInjection.cs BookstorePro/src/BookstorePro.Infrastructure/Logging BookstorePro/src/BookstorePro.Wpf/DependencyInjection.cs BookstorePro/src/BookstorePro.Wpf/App.xaml BookstorePro/src/BookstorePro.Wpf/App.xaml.cs BookstorePro/src/BookstorePro.Wpf/Services BookstorePro/src/BookstorePro.Wpf/ViewModels/ConnectionRecoveryViewModel.cs BookstorePro/src/BookstorePro.Wpf/Views/ConnectionRecoveryWindow.xaml BookstorePro/src/BookstorePro.Wpf/appsettings.json BookstorePro/src/BookstorePro.Wpf/appsettings.example.json BookstorePro/scripts/setup-database.ps1 BookstorePro/database/BookstorePro.sql BookstorePro/tests/BookstorePro.Tests/Infrastructure/LogRedactorTests.cs BookstorePro/tests/BookstorePro.Tests/Infrastructure/RollingFileLoggerTests.cs BookstorePro/tests/BookstorePro.Tests/Wpf/ExceptionMessageMapperTests.cs BookstorePro/tests/BookstorePro.Tests/Wpf/ConnectionRecoveryViewModelTests.cs
git commit -m "feat: add resilient startup setup and safe logs"
```

## Task 16: Add deterministic demo data, SQL Server integration tests, release verification, and user guides

**Files:**
- Create: `BookstorePro/src/BookstorePro.Infrastructure/Persistence/DemoDataSeeder.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/SqlServerCollection.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/MigrationIntegrationTests.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/TransactionIntegrationTests.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/ConcurrencyIntegrationTests.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/Infrastructure/SeedIntegrationTests.cs`
- Create: `BookstorePro/tests/BookstorePro.Tests/TestDoubles/DemoCredentialReader.cs`
- Create: `BookstorePro/scripts/verify-release.ps1`
- Create: `BookstorePro/README.md`
- Create: `BookstorePro/HUONG_DAN_CAI_DAT.md`
- Create: `BookstorePro/DEMO_GUIDE.md`
- Create: `BookstorePro/CREDITS.md`
- Create: `BookstorePro/docs/test-results/MANUAL_TEST_CHECKLIST.md`

**Interfaces:**
- Consumes: migrations, all EF stores, services, authentication, setup helper.
- Produces: deterministic, idempotent demo data; real SQL Server verification suite; reproducible release command; complete Vietnamese setup/demo/credits documents.

- [ ] **Step 1: Write failing seed and integration tests**

```csharp
[Fact]
public async Task Seed_IsIdempotentAndBothDemoAccountsAuthenticate()
{
    await fixture.Seeder.SeedAsync(default);
    await fixture.Seeder.SeedAsync(default);
    Assert.Equal(2, await fixture.Db.UserAccounts.CountAsync());
    var credentials = DemoCredentialReader.FromDemoGuide();
    Assert.True((await fixture.Auth.SignInAsync(new("admin", credentials.AdminPassword), default)).Succeeded);
    Assert.True((await fixture.Auth.SignInAsync(new("nhanvien", credentials.StaffPassword), default)).Succeeded);
}

[Fact]
public async Task CheckoutFailure_RollsBackInvoiceInventoryMovementAndAuditInSqlServer()
{
    var before = await fixture.SnapshotAsync();
    fixture.Failpoint.ThrowBeforeSave = true;
    await Assert.ThrowsAsync<InjectedFailureException>(() =>
        fixture.Checkout.CheckoutAsync(fixture.ValidCheckout, default));
    var after = await fixture.SnapshotAsync();
    Assert.Equal(before, after);
}

[Fact]
public async Task TwoContextsUpdatingSameInventory_SecondSaveGetsConcurrencyException()
{
    await using var first = fixture.CreateContext();
    await using var second = fixture.CreateContext();
    var a = await first.Inventories.SingleAsync(x => x.BookId == fixture.BookId);
    var b = await second.Inventories.SingleAsync(x => x.BookId == fixture.BookId);
    a.AdjustTo(a.Quantity + 1);
    b.AdjustTo(b.Quantity + 2);
    await first.SaveChangesAsync();
    await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());
}
```

- [ ] **Step 2: Configure isolated SQL Server test databases**

`SqlServerCollection` reads `BOOKSTOREPRO_TEST_CONNECTION`. It derives a unique
database name `BookstorePro_Test_<processId>_<guid>`, uses `master` to create it,
applies migrations, exposes scoped services, and drops only that exact validated
database in `IAsyncLifetime.DisposeAsync`. Reject names that do not start with
`BookstorePro_Test_`. If the environment variable is absent, fail with
`"Set BOOKSTOREPRO_TEST_CONNECTION to a SQL Server 2019+ master connection."`
rather than silently skipping the integration gate.

- [ ] **Step 3: Implement realistic idempotent Vietnamese demo data**

Seed these fixed master records only when their business key is absent:

- authors: Tô Hoài, Nguyễn Nhật Ánh, Nam Cao, Ngô Tất Tố, Xuân Quỳnh;
- fields/categories: Văn học/Văn học Việt Nam, Kỹ năng/Kỹ năng sống,
  Thiếu nhi/Truyện thiếu nhi;
- publishers: Kim Đồng, Trẻ, Văn học;
- books: `Dế Mèn phiêu lưu ký`, `Cho tôi xin một vé đi tuổi thơ`, `Lão Hạc`,
  `Tắt đèn`, `Sóng`, `Đắc nhân tâm`, `Nhà giả kim`, `Tôi thấy hoa vàng trên cỏ
  xanh`, `Kính vạn hoa`, `Mắt biếc`;
- customers: five Vietnamese names with valid phone/email combinations;
- suppliers: Nhà sách Phương Nam, Fahasa, Công ty Sách Alpha;
- inventory: quantities spanning 0, exact-minimum, low, and healthy stock;
- opening movements, two posted receipts, completed invoices across the latest
  seven local calendar days, and one cancelled invoice.

Use the supplied `IClock` so integration tests freeze `UtcNow`. Generate all
business codes through the same SQL sequence/formatter path used by runtime.
Seed invoice cost/price snapshots and movement balances consistently; never
disable constraints to insert demo rows.

- [ ] **Step 4: Run the real SQL Server suite and fix every failure**

On a machine with SQL Server 2019+:

```powershell
$env:BOOKSTOREPRO_TEST_CONNECTION='Server=.\SQLEXPRESS;Database=master;Trusted_Connection=True;TrustServerCertificate=True'
dotnet test BookstorePro.sln -c Release --filter 'FullyQualifiedName~Infrastructure' --logger 'trx;LogFileName=sql-integration.trx' --results-directory docs/test-results
```

Expected: PASS for clean migration, checks/unique indexes/restrictive deletes,
sequence formatting, receipt/checkout/cancellation commits, injected rollback,
rowversion concurrency, seed idempotency, and both demo logins.

- [ ] **Step 5: Write exact setup, demo, credit, and manual-test documents**

`README.md` identifies .NET 8 WPF, five-project architecture, modules, quick
start, demo credentials, build/test/publish commands, and document links.

`HUONG_DAN_CAI_DAT.md` covers prerequisites, SQL Server Express installation,
TCP/local instance choice, `setup-database.ps1`, manual `appsettings.Local.json`,
connection test, launch, backup, and five common errors with fixes.

`DEMO_GUIDE.md` gives this deterministic 10-minute path: admin login; dashboard;
catalog search; create customer; post receipt; A1 sale with exact stock; print
preview; cancel invoice once and reject second cancel; financial report/CSV;
audit; staff login and demonstrate hidden admin/adjustment plus 10% discount cap.

`CREDITS.md` states that the WinForms/.NET Core 3.1 source/report was an inherited
requirements baseline with permission, lists the redesigned WPF/MVVM/EF Core/
security/transaction/testing/documentation work, and uses this contribution
matrix:

| Member | Primary work | Shared work |
|---|---|---|
| Huỳnh Trung Hiếu | Domain architecture, SQL/EF Core, inventory, checkout/cancellation, setup | Requirements, integration, testing, final review |
| Nguyễn Thị Minh Ánh | Executive Navy WPF/MVVM, catalog/parties, dashboard/reports, report layout | Requirements, integration, testing, final review |

`MANUAL_TEST_CHECKLIST.md` has tester/date/build/SQL Server fields and rows for
both logins, three-failure delay, every navigation item, CRUD validation,
deactivation/history, receipt commit, adjustment authorization, exact and
insufficient stock, discount caps, both payments, print preview, first/second
cancellation, dashboard agreement, inclusive reports, Vietnamese CSV, connection
recovery, concurrency reload, keyboard traversal, and both target resolutions.

- [ ] **Step 6: Create the release verification script**

`verify-release.ps1` stops on error and runs:

```powershell
dotnet restore BookstorePro.sln --locked-mode
dotnet build BookstorePro.sln -c Release --no-restore
dotnet test BookstorePro.sln -c Release --no-build --logger 'trx;LogFileName=all-tests.trx' --collect 'XPlat Code Coverage' --results-directory docs/test-results
dotnet ef database update --project src/BookstorePro.Infrastructure --startup-project src/BookstorePro.Wpf --connection $env:BOOKSTOREPRO_VERIFY_CONNECTION
dotnet publish src/BookstorePro.Wpf/BookstorePro.Wpf.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o deliverables/BookstorePro-win-x64
```

It then fails if build output contains warnings/errors, test TRX has failures,
the publish folder lacks `BookstorePro.Wpf.exe`, or any staged/tracked file is
named `appsettings.Local.json` or resides under `.vs`, `bin`, `obj`, or `logs`.

- [ ] **Step 7: Run all automated and documentation checks**

Run:

```powershell
dotnet build BookstorePro.sln -c Release
dotnet test BookstorePro.sln -c Release
Select-String -Path README.md,HUONG_DAN_CAI_DAT.md,DEMO_GUIDE.md,CREDITS.md -Pattern 'Admin@123!','Staff@123!','WinForms','WPF','SQL Server'
```

Expected: build and tests PASS; documentation search returns deliberate matches
for credentials, inheritance disclosure, new platform, and database.

- [ ] **Step 8: Commit**

```bash
git add BookstorePro/src/BookstorePro.Infrastructure/Persistence/DemoDataSeeder.cs BookstorePro/tests/BookstorePro.Tests/Infrastructure BookstorePro/tests/BookstorePro.Tests/TestDoubles/DemoCredentialReader.cs BookstorePro/scripts/verify-release.ps1 BookstorePro/README.md BookstorePro/HUONG_DAN_CAI_DAT.md BookstorePro/DEMO_GUIDE.md BookstorePro/CREDITS.md BookstorePro/docs/test-results/MANUAL_TEST_CHECKLIST.md
git commit -m "test: verify SQL Server release and demo path"
```

## Task 17: Rewrite the final report, verify Word/PDF layout, and package the submission

**Files:**
- Read: `/Users/macos/Documents/Zalo Received Files/Trung Hiếu-Minh Ánh.docx`
- Create: `BookstorePro/docs/report-source/legacy-report.docx`
- Create: `BookstorePro/docs/report-source/report-content.md`
- Create: `BookstorePro/docs/diagrams/context.mmd`
- Create: `BookstorePro/docs/diagrams/use-cases.mmd`
- Create: `BookstorePro/docs/diagrams/deployment.mmd`
- Create: `BookstorePro/docs/diagrams/architecture.mmd`
- Create: `BookstorePro/docs/diagrams/erd.mmd`
- Create: `BookstorePro/docs/diagrams/checkout-sequence.mmd`
- Create: `BookstorePro/docs/diagrams/cancellation-sequence.mmd`
- Create: `BookstorePro/docs/diagrams/receipt-sequence.mmd`
- Create: `BookstorePro/docs/screenshots/01-login.png`
- Create: `BookstorePro/docs/screenshots/02-dashboard-admin.png`
- Create: `BookstorePro/docs/screenshots/03-books.png`
- Create: `BookstorePro/docs/screenshots/04-sales-a1.png`
- Create: `BookstorePro/docs/screenshots/05-stock-receipt.png`
- Create: `BookstorePro/docs/screenshots/06-reports.png`
- Create: `BookstorePro/docs/screenshots/07-admin.png`
- Create: `BookstorePro/deliverables/Bao-cao-cuoi-ky-BookstorePro.docx`
- Create: `BookstorePro/deliverables/Bao-cao-cuoi-ky-BookstorePro.pdf`
- Create: `BookstorePro/scripts/package-submission.ps1`
- Create: `BookstorePro/deliverables/SHA256SUMS.txt`
- Create: `BookstorePro/deliverables/BookstorePro-Submission.zip`

**Interfaces:**
- Consumes: final migrations/schema, implementation, test results, manual checklist, runtime build, design prototype, credits and guides.
- Produces: A4 Word report and matching PDF; diagram sources/exports; verified runtime captures; clean ZIP and SHA-256 manifest.

- [ ] **Step 1: Load the document skill and inventory reusable legacy content**

Use `document-skills:docx` before reading or editing the Word file. Copy the
original into `docs/report-source/legacy-report.docx`, extract paragraphs, tables,
styles, headers/footers, images, section geometry, comments, and document
properties. Retain only content that is factually correct for the WPF redesign;
rewrite all implementation/schema/UI/test statements from final artifacts.

Record the report title exactly as:

```text
XÂY DỰNG ỨNG DỤNG QUẢN LÝ NHÀ SÁCH BOOKSTORE PRO
TIỂU LUẬN CUỐI KỲ MÔN LẬP TRÌNH TRÊN WINDOWS
Huỳnh Trung Hiếu — 221A011106
Nguyễn Thị Minh Ánh — 221A370840
Lớp học phần: 253INT441901
```

- [ ] **Step 2: Generate the exact diagram set from final code/schema**

Write Mermaid sources and export legible PNG/SVG at print resolution:

1. system context: Administrator, Staff, Bookstore Pro WPF, SQL Server, printer,
   CSV/Excel;
2. role-based use cases for every delivered module;
3. deployment: Windows client, .NET 8 WPF process, local config/logs, SQL Server;
4. five-project dependency architecture;
5. ERD containing every entity, key, composite key, relationship, and rowversion;
6. checkout sequence from ViewModel through Application/transaction/EF/SQL;
7. cancellation sequence with stock restoration and audit;
8. receipt sequence with latest purchase cost, movements, and audit.

Verify diagram labels against `BookstoreDbContextModelSnapshot.cs` and the
canonical service signatures; diagrams may not contain tables, screens, or
services absent from the final build.

- [ ] **Step 3: Capture and validate real Windows runtime screens**

On Windows 10 22H2 or Windows 11, run the Release build at 1366×768 with seeded
data and capture the seven named PNG files. Repeat visual checks at 1920×1080.
Each image must show the final executable, readable Vietnamese text, no debugger,
no personal desktop content, no credentials, no error state, and enough seeded
data to explain the feature. `04-sales-a1.png` must show both catalog and cart;
`07-admin.png` must be captured while signed in as Administrator.

Design companion images, if included, are captioned `Nguyên mẫu thiết kế`.
Only the seven Windows captures are captioned `Ảnh chụp sản phẩm thực tế`.

- [ ] **Step 4: Write report content in a fixed, evidence-backed structure**

Create `report-content.md` with these chapters and evidence:

1. Bìa, nhận xét giảng viên, lời cảm ơn, mục lục tự động, danh mục hình/bảng.
2. Chương 1 — lý do chọn đề tài, mục tiêu, phạm vi/non-goals, users, inherited
   baseline disclosure, method, deliverables.
3. Chương 2 — functional requirements by module; non-functional security,
   reliability, usability, compatibility, performance; role-permission matrix;
   context and use-case diagrams.
4. Chương 3 — five-project architecture, MVVM interactions, deployment, ERD,
   full physical data dictionary for every table/column/type/nullability/key/
   constraint/index; transaction and concurrency design; three sequence diagrams;
   Executive Navy/A1 design rationale.
5. Chương 4 — implementation of DI/configuration, EF migrations/sequences,
   PBKDF2/auth/roles, master-data lifecycle, receipt, checkout/cancellation,
   reporting/CSV, `FlowDocument`, logging/error mapping; seven runtime screens.
6. Chương 5 — environment, unit/application/ViewModel/integration strategy,
   automated result table populated from TRX, at least 20 manual cases populated
   from the signed checklist, defect/fix examples, requirement traceability,
   performance observations, limitations.
7. Chương 6 — achieved results, direct comparison with the inherited baseline,
   remaining non-goals, future work, conclusion.
8. References and appendices — official Microsoft/.NET/EF/WPF/SQL Server sources,
   installation/demo guide, contribution matrix, inherited-work statement, key
   configuration excerpts, checksum reference.

Use direct wording and figures derived from final results. Do not claim cloud,
web/mobile, online payment, barcode hardware, multi-branch stock, or dark mode.

- [ ] **Step 5: Build the A4 Word document with controlled styles**

Use the document skill's supported document-generation/editing workflow. Apply:

- A4 portrait, 2.5cm top/bottom, 3.0cm left, 2.0cm right;
- Times New Roman 13pt body, 1.3 line spacing, 6pt after, justified;
- Heading 1 16pt bold uppercase, Heading 2 14pt bold, Heading 3 13pt bold;
- numbered headings; automatic TOC; page numbers centered in footer;
- roman numbering for front matter and Arabic numbering from Chapter 1;
- table header repeat, no split rows, 10.5–11pt table text;
- centered figures with sequential captions and in-text references;
- headers showing abbreviated project/course name from Chapter 1 onward;
- document properties title, authors, subject, and keywords matching the cover.

Prefer 45–65 substantive pages; never add repeated prose merely to reach a page
count. Update all fields before saving.

- [ ] **Step 6: Run semantic and visual report verification**

Extract all Word text and fail the report if it contains legacy student names,
legacy class identifiers, incomplete drafting phrases, unsupported feature
claims, or filenames/paths from another machine. Required exact strings are the
two student names/IDs, course/class, `.NET 8`, `WPF`, `MVVM`, `EF Core 8`,
`SQL Server`, `PBKDF2`, `rowversion`, `A1 Split POS`, and both demo usernames.

Render the DOCX to page images and inspect every page for overflow, clipped
tables, orphan headings, blank pages, unreadable diagrams, caption separation,
TOC page accuracy, and header/footer collisions. Export to PDF, render the PDF,
and compare page count plus first/last page text. Inspect the Word ZIP to confirm
all seven runtime PNGs and exported diagrams are embedded.

Expected: Word and PDF have consistent content and professional A4 pagination;
all checks pass with no incorrect identity or product claim.

- [ ] **Step 7: Create a clean, deterministic submission package**

`package-submission.ps1` removes only its own prior staging directory, then copies
source, solution, database/setup, guides, diagrams, test evidence, Word/PDF, and
self-contained publish output. Exclude with explicit relative-path rules:

```powershell
$excludedDirectoryNames = @('.git', '.vs', 'bin', 'obj', 'logs', 'TestResults')
$excludedFileNames = @('appsettings.Local.json', '*.user', '*.suo', '*.mdf', '*.ldf')
```

Before compression, scan text/config files for `Password=`, demo plaintext
passwords outside `README.md`, `HUONG_DAN_CAI_DAT.md`, `DEMO_GUIDE.md`, and the
report, plus absolute paths beginning `C:\Users\` or `/Users/`. Fail on a match
outside the allowed documentation set. Create the ZIP with a stable root folder
`BookstorePro-Submission/`, calculate SHA-256 for the ZIP, Word, PDF, executable,
and database script, and write relative filenames to `SHA256SUMS.txt`.

- [ ] **Step 8: Perform the final clean-room gate**

On a clean Windows account or VM:

```powershell
Expand-Archive .\BookstorePro-Submission.zip .\verification
Set-Location .\verification\BookstorePro-Submission\BookstorePro
.\scripts\setup-database.ps1 -ServerInstance '.\SQLEXPRESS'
dotnet build .\BookstorePro.sln -c Release
dotnet test .\BookstorePro.sln -c Release
.\deliverables\BookstorePro-win-x64\BookstorePro.Wpf.exe
```

Complete and sign the manual checklist for admin and staff at both target
resolutions. Verify stock receipt, exact-stock sale, insufficient-stock rejection,
single cancellation, report totals, Vietnamese CSV, and no credential in logs.
Re-run `verify-release.ps1` and `package-submission.ps1` after any fix.

- [ ] **Step 9: Commit report sources and final delivery artifacts**

```bash
git add BookstorePro/docs/report-source BookstorePro/docs/diagrams BookstorePro/docs/screenshots BookstorePro/deliverables/Bao-cao-cuoi-ky-BookstorePro.docx BookstorePro/deliverables/Bao-cao-cuoi-ky-BookstorePro.pdf BookstorePro/deliverables/SHA256SUMS.txt BookstorePro/scripts/package-submission.ps1
git commit -m "docs: deliver verified report and submission package"
```

Do not add the generated ZIP or self-contained publish folder to Git; they remain
local deliverables referenced by `SHA256SUMS.txt` and are provided to the user.

## Acceptance traceability

| Acceptance criterion | Primary implementation task | Verification |
|---|---:|---|
| Clean database setup | 3, 15, 16 | empty-database migration test and clean-machine setup |
| Both roles and correct navigation/actions | 4, 10, 14 | auth/authorization/ViewModel tests and manual role pass |
| Validated master data with history | 5, 6, 11 | service and ViewModel tests plus restrictive-delete integration test |
| Atomic stock receipt | 7, 12 | rollback unit test and SQL Server transaction test |
| Exact stock and atomic checkout | 8, 13 | exact/insufficient/rollback tests and manual POS pass |
| One cancellation restores stock | 8, 13 | cancellation unit/integration tests and second-attempt rejection |
| Dashboard/reports agree with invoices | 9, 14 | aggregation tests and seeded-data reconciliation |
| Vietnamese CSV and selected range | 9, 14 | BOM/escaping test and Excel manual inspection |
| Release build/tests/publish | 1–16 | `verify-release.ps1` and clean Windows gate |
| Word/PDF contains only final truth | 17 | semantic scan, rendered-page inspection, schema/code cross-check |

## Final implementation completion gate

The implementation is complete only when all of the following commands finish
successfully on the final commit and their evidence is stored under
`docs/test-results/`:

```powershell
dotnet build BookstorePro.sln -c Release
dotnet test BookstorePro.sln -c Release
dotnet ef migrations script --idempotent --project src/BookstorePro.Infrastructure --startup-project src/BookstorePro.Wpf
dotnet publish src/BookstorePro.Wpf/BookstorePro.Wpf.csproj -c Release -r win-x64 --self-contained true -o deliverables/BookstorePro-win-x64
.\scripts\verify-release.ps1
.\scripts\package-submission.ps1
```

The final reviewer must also compare the migration snapshot, physical data
dictionary, diagrams, screenshots, automated results, signed manual checklist,
and both report formats before declaring the submission ready.
