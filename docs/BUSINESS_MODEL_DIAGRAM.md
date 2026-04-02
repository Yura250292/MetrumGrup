# Бізнес-модель Metrum Group - Візуалізація

## ERD Діаграма (Entity Relationship Diagram)

```mermaid
erDiagram
    %% Користувачі та Автентифікація
    User ||--o{ Project : "manages (manager)"
    User ||--o{ Project : "owns (client)"
    User ||--o{ Estimate : "creates"
    User ||--o{ Estimate : "engineer_reviews"
    User ||--o{ Estimate : "finance_reviews"
    User ||--o{ Payment : "processes"
    User ||--o{ PhotoReport : "uploads"
    User ||--o{ ProjectFile : "uploads"
    User ||--o{ NewsArticle : "publishes"
    User ||--o{ Notification : "receives"
    User ||--o{ AuditLog : "performs"
    User ||--o{ FinancialTemplate : "creates"
    User ||--o{ InventoryTransaction : "executes"

    %% Проекти та їх компоненти
    Project ||--o{ Estimate : "has"
    Project ||--o{ Payment : "receives"
    Project ||--o{ PhotoReport : "documents"
    Project ||--o{ ProjectFile : "contains"
    Project ||--o{ InventoryTransaction : "uses_materials"

    %% Кошториси та їх структура
    Estimate ||--o{ EstimateSection : "organized_by"
    Estimate ||--o{ EstimateItem : "contains"
    EstimateSection ||--o{ EstimateItem : "groups"

    %% Матеріали
    Material ||--o{ EstimateItem : "used_in"
    Material ||--o{ Inventory : "stored_as"
    Material ||--o{ InventoryTransaction : "tracks"

    %% Інвентар
    Inventory ||--o{ InventoryTransaction : "has_movements"

    User {
        string id PK
        string email UK
        string password
        string name
        string phone
        string avatar
        enum role "SUPER_ADMIN|MANAGER|CLIENT|ENGINEER|FINANCIER"
        boolean isActive
        string telegramId UK
        string telegramUsername
        string telegramChatId
        datetime createdAt
        datetime updatedAt
    }

    Project {
        string id PK
        string title
        string slug UK
        string description
        string address
        decimal area "м²"
        datetime startDate
        datetime endDate
        datetime actualEndDate
        decimal budget
        decimal totalCost
        decimal totalPaid
        decimal totalLabor
        decimal totalMaterials
        enum status "PLANNING|IN_PROGRESS|ON_HOLD|COMPLETED|CANCELLED"
        enum stage "FOUNDATION|WALLS|ROOF|FINISHING|COMPLETED"
        string clientId FK
        string managerId FK
    }

    Estimate {
        string id PK
        string number UK
        string title
        string description
        int version
        decimal totalMaterials
        decimal totalLabor
        decimal totalOverhead
        decimal totalAmount
        decimal discount
        decimal finalAmount
        decimal finalClientPrice
        decimal profitAmount
        decimal profitMarginOverall
        decimal pdvAmount "ПДВ 20%"
        decimal esvAmount "ЄСВ 22%"
        decimal militaryTaxAmount "ВЗ 1.5%"
        enum status "DRAFT|SENT|APPROVED|REJECTED|ENGINEER_REVIEW|FINANCE_REVIEW"
        string verificationStatus "passed|warnings|critical|not_verified"
        decimal verificationScore "0-100"
        json verificationResults "AI перевірка"
        datetime verifiedAt
        string verifiedBy "openai|anthropic"
        string projectId FK
        string createdById FK
        string engineerReviewedById FK
        string financeReviewedById FK
    }

    EstimateSection {
        string id PK
        string title
        int sortOrder
        string estimateId FK
    }

    EstimateItem {
        string id PK
        string description
        string unit "м²|м³|шт|кг"
        decimal quantity
        decimal unitPrice
        decimal laborRate
        decimal laborHours
        decimal amount "quantity × unitPrice + laborCost"
        decimal customMarginPercent
        decimal marginAmount
        decimal priceWithMargin
        boolean isManualOverride
        int sortOrder
        string estimateId FK
        string sectionId FK
        string materialId FK
    }

    Material {
        string id PK
        string name
        string sku UK
        string category
        string unit
        decimal basePrice
        decimal laborRate
        decimal markup "%"
        string description
        boolean isActive
    }

    Payment {
        string id PK
        decimal amount
        datetime date
        enum method "CASH|CARD|TRANSFER|OTHER"
        enum status "PENDING|COMPLETED|FAILED|REFUNDED"
        string description
        string projectId FK
        string userId FK
    }

    PhotoReport {
        string id PK
        string title
        string description
        datetime date
        string stage
        json images "array of URLs"
        boolean isPublic
        string projectId FK
        string uploadedById FK
    }

    ProjectFile {
        string id PK
        string filename
        string path
        int size
        string mimeType
        enum fileType "PHOTO_REPORT|DOCUMENT|PLAN|COMPLETION_ACT|ESTIMATE"
        datetime uploadedAt
        string projectId FK
        string uploadedById FK
    }

    Inventory {
        string id PK
        decimal currentQuantity
        decimal minQuantity
        string location
        string materialId FK
    }

    InventoryTransaction {
        string id PK
        enum type "PURCHASE|USAGE|RETURN|ADJUSTMENT"
        decimal quantity
        decimal unitCost
        decimal totalCost
        string notes
        string materialId FK
        string projectId FK
        string userId FK
    }

    NewsArticle {
        string id PK
        string title
        string content
        datetime publishedAt
        boolean isPublished
        string authorId FK
    }

    Notification {
        string id PK
        string title
        string message
        boolean isRead
        datetime createdAt
        string userId FK
    }

    FinancialTemplate {
        string id PK
        string name
        string description
        enum taxationType "PDV|UNIFIED|NO_TAX"
        decimal globalMarginPercent
        decimal logisticsCost
        json categoryMargins
        string createdById FK
    }

    TaxRecord {
        string id PK
        string estimateId
        enum taxationType
        decimal pdvAmount
        decimal esvAmount
        decimal militaryTaxAmount
        decimal profitTaxAmount
        decimal unifiedTaxAmount
        decimal pdfoAmount
        decimal totalTaxAmount
        decimal netProfit
        decimal effectiveTaxRate
        json calculationDetails
        datetime calculatedAt
    }

    AuditLog {
        string id PK
        string action
        string entityType
        string entityId
        json changes
        string ipAddress
        string userAgent
        datetime createdAt
        string userId FK
    }
```

---

## Бізнес-процес: AI Генерація Кошторису

```mermaid
flowchart TD
    Start([Менеджер]) --> Upload[Завантажує файли<br/>PDF, Excel, зображення]
    Upload --> Select[Вибирає тип проекту<br/>і категорії робіт]
    Select --> Gemini{AI Gemini<br/>аналізує}

    Gemini --> Parse[Розпізнає текст<br/>з PDF/Excel]
    Parse --> Vision[Аналізує зображення<br/>планів]
    Vision --> Search[Google Search<br/>актуальні ціни]
    Search --> Generate[Генерує кошторис<br/>50-120+ позицій]

    Generate --> OpenAI{OpenAI GPT-4o<br/>верифікує}

    OpenAI --> Check1[✓ Коректність<br/>розрахунків]
    OpenAI --> Check2[✓ Реалістичність<br/>цін]
    OpenAI --> Check3[✓ Повнота<br/>позицій]
    OpenAI --> Check4[✓ Логіка<br/>секцій]
    OpenAI --> Check5[✓ Специфікації<br/>матеріалів]

    Check1 --> Score[Оцінка 0-100<br/>+ список проблем]
    Check2 --> Score
    Check3 --> Score
    Check4 --> Score
    Check5 --> Score

    Score --> Manager{Менеджер<br/>перевіряє}

    Manager -->|Редагувати| Edit[Ручне редагування<br/>або AI refine]
    Edit --> Manager

    Manager -->|Зберегти| Save[Збереження<br/>кошторису]

    Save --> Engineer{Інженер<br/>ENGINEER_REVIEW}
    Engineer -->|Відхилити| Manager
    Engineer -->|Затвердити| Finance{Фінансист<br/>FINANCE_REVIEW}

    Finance -->|Відхилити| Manager
    Finance -->|Затвердити| Send[Відправка<br/>клієнту SENT]

    Send --> Client{Клієнт<br/>перевіряє}

    Client -->|REJECTED| Manager
    Client -->|APPROVED| Complete([Затверджено✓])

    style Gemini fill:#9f7aea
    style OpenAI fill:#9f7aea
    style Score fill:#48bb78
    style Complete fill:#48bb78
```

---

## Архітектура системи

```mermaid
flowchart TB
    subgraph Client["🖥️ Frontend (Next.js React)"]
        UI[UI Components<br/>Shadcn/ui + Tailwind]
        Pages[Pages<br/>Projects, Estimates, Reports]
    end

    subgraph Backend["⚙️ Backend (Next.js API Routes)"]
        API[API Routes<br/>/api/admin/*]
        Auth[NextAuth.js<br/>Authentication]
        Prisma[Prisma ORM<br/>Type-safe queries]
    end

    subgraph AI["🤖 AI Services"]
        Gemini[Google Gemini<br/>+ Google Search]
        OpenAI[OpenAI GPT-4o<br/>Verification]
        Anthropic[Anthropic Claude<br/>Alternative]
    end

    subgraph DB["💾 Database"]
        Postgres[(PostgreSQL<br/>Railway/Vercel)]
    end

    subgraph External["🔗 External Services"]
        Telegram[Telegram Bot API<br/>Notifications]
        Email[Email Service<br/>Client notifications]
        Storage[Cloudflare/S3<br/>File storage]
    end

    UI --> Pages
    Pages --> API
    API --> Auth
    API --> Prisma
    Prisma --> Postgres

    API --> Gemini
    API --> OpenAI
    API --> Anthropic

    API --> Telegram
    API --> Email
    API --> Storage

    style Gemini fill:#9f7aea
    style OpenAI fill:#9f7aea
    style Anthropic fill:#9f7aea
    style Postgres fill:#4299e1
```

---

## Матриця доступу

```mermaid
graph TD
    subgraph Roles["👥 Ролі користувачів"]
        SA[SUPER_ADMIN<br/>Повний доступ]
        M[MANAGER<br/>Управління]
        E[ENGINEER<br/>Технічна перевірка]
        F[FINANCIER<br/>Фінансова перевірка]
        C[CLIENT<br/>Перегляд своїх проектів]
    end

    subgraph Actions["🔐 Дозволені дії"]
        A1[Створювати проекти]
        A2[Генерувати кошториси AI]
        A3[Технічна перевірка]
        A4[Фінансова перевірка]
        A5[Затверджувати кошториси]
        A6[Управляти інвентарем]
        A7[Переглядати аудит логи]
    end

    SA --> A1
    SA --> A2
    SA --> A3
    SA --> A4
    SA --> A5
    SA --> A6
    SA --> A7

    M --> A1
    M --> A2
    M --> A3
    M --> A4
    M --> A6

    E --> A3

    F --> A4
    F --> A5

    C --> A5

    style SA fill:#e53e3e
    style M fill:#dd6b20
    style E fill:#38a169
    style F fill:#3182ce
    style C fill:#805ad5
```

---

## Ключові метрики

```mermaid
pie title Статуси проектів
    "IN_PROGRESS" : 45
    "PLANNING" : 20
    "COMPLETED" : 25
    "ON_HOLD" : 7
    "CANCELLED" : 3
```

```mermaid
pie title AI Верифікація (оцінки)
    "Passed (85-100)" : 65
    "Warnings (60-84)" : 25
    "Critical (0-59)" : 10
```

---

## Використання

**GitHub:** Ці діаграми автоматично рендеряться в README.md

**Інші платформи:**
- Скопіюйте Mermaid код
- Вставте на mermaid.live для рендерингу
- Експортуйте як PNG/SVG

**Онлайн редактори:**
- https://mermaid.live
- https://mermaid-js.github.io/mermaid-live-editor

**VSCode:**
- Встановіть розширення "Markdown Preview Mermaid Support"
- Відкрийте preview (Cmd+Shift+V)
