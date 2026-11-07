# Receipt ETA Tracking System

A secure, lightweight shipment and receipt tracking system with public ETA tracking links and admin management.

## 🚀 Features

### 1. Public Tracking Page (What the Customer Sees)
- Accessible via a unique, unguessable link (e.g. `http://localhost:3000/track/trk_alpha789`).
- Displays **strictly** the allowed fields and **nothing else**:
  - **Receipt No.**
  - **Item Name**
  - **CBM** (Cubic Meters)
  - **CTN** (Carton count)
  - **Weight**
  - **Container No. (not actual)**
  - **ETA** (Estimated Time of Arrival)
  - **Remain Days** (computed live based on ETA)
- **Zero Sensitive Data**: Admin notes, actual internal container numbers, costs, and other customer data are 100% hidden.
- Supports single or multiple receipts under the same tracking link.
- Mobile-friendly, auto-refreshing tracking view.

### 2. Admin Portal (`http://localhost:3000/admin`)
- View and manage all receipts in real time.
- **Add New Receipt**:
  - Input Receipt No, Item Name, CBM, CTN, Weight, Container No. (not actual), Actual Container No. (admin only), ETA, and Admin notes.
  - Choose between:
    - **Generate New Tracking Link** (creates a unique link for that receipt)
    - **Add to Existing Tracking Link** (allows admin to attach new receipt numbers to the **same link** already given to the customer).
- **Update ETA**: Admin can edit ETA anytime; changes reflect immediately on the customer's tracking link.
- **One-Click Copy Link**: Instantly copy shareable tracking links to clipboard.

---

## 🛠️ How to Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Access points**:
   - **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)
   - **Sample Public Tracking Link**: [http://localhost:3000/track/trk_alpha789](http://localhost:3000/track/trk_alpha789)
