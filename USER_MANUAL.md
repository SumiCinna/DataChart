# DataChart User Manual

## Overview
DataChart turns uploaded CSV/XLSX data into interactive charts and a geographic map view. The system has three roles:
- Boss: view-only access to the dashboard and map.
- Staff: dashboard access plus file management (upload/activate data).
- Admin: account management only (no charts or file management).

## Logging In & Out
- Go to the Sign In page and enter your username/email and password.
- If your account is pending or inactive, you will see a message and cannot proceed.
- Logging out uses a confirmation dialog. Click "Sign out" and then confirm to complete the logout.

## The Navbar
- Role badge: shows your current role (Boss, Staff, Admin).
- Name: your full name (if available).
- Files (Staff only): opens File Management.
- Admin (Admin only): opens Account Management.
- Download All (Dashboard): downloads all charts (shows only when data is loaded).
- Sign out: opens the logout confirmation dialog.

## The Dashboard
The dashboard appears for Boss and Staff when an active file exists.

### Stat Cards
- Total Rows: total number of data rows.
- Columns: number of columns in the dataset.
- Numeric Series: count of numeric columns detected.
- Value Total: combined total of the active numeric series (varies by selection).

### Group/Label Selector
- Use the Group/Label dropdown to choose a column for chart grouping.
- Use Reset All Charts to clear custom chart settings and filters.

### Chart Types
- Line Chart: trends across grouped labels.
- Bar Chart: side-by-side comparisons.
- Area Chart: cumulative trends.
- Pie/Donut: share of totals per group.

### Chart Controls (Each Chart)
- Rows: limit how many rows are shown in the chart and table.
- Order: sort order (default, highest first, lowest first).
- Slice: current rows, top values, or bottom values.
- Clear: reset that chart to defaults.
- Filter: open the filter panel for that chart.
- PNG: download the chart image.
- Download Data (table footer): export the table data for that chart.

### Filtering
- Use the Filter button to open the filter panel.
- Level 1: choose a column and value. Use Add to include multiple values (up to 10).
- Optional Level 2/3: refine with more specific columns and values.
- Use Clear in the filter panel to remove filters.

## Philippines Map
- Click a region to see its rows below the map.
- Search controls:
  - Scope: search in the selected region or all data.
  - Search input: type a keyword to filter visible rows.
- Download CSV: export rows based on the current map scope.

## File Management (Staff only)
- Upload New File: click the drop zone or drag and drop a file.
- Allowed types: CSV, XLSX, XLS, TXT (max 20 MB).
- Show: mark a file as the active dataset for the dashboard.
- Clear Active: remove the active dataset (dashboard shows "No active dataset").
- Delete: remove an uploaded file.

## Admin Panel (Admin only)
- Approve or reject pending account requests.
- Activate or deactivate existing accounts.
- Change user roles (Admin, Staff, Boss).
- Delete accounts (cannot delete your own account).

## Troubleshooting
- "No active dataset": a Staff member must upload and activate a file.
- Charts show dashes or empty: your file may have no numeric columns; change Group/Label.
- Filters show no results: clear filters and try a different column/value.
- Map shows no rows after clicking a region: the dataset may not include matching region names.
- Upload fails: check file type and size; ensure the server has permission to write to uploads/.
- Login blocked: account is pending approval or has been deactivated by admin.

## Quick Reference
- View charts: Sign in as Boss or Staff, open Dashboard.
- Upload data: Staff -> File Management -> Upload File.
- Activate file: Staff -> File Management -> Show.
- Filter charts: Dashboard -> Filter -> select column/value.
- Export chart: Dashboard -> PNG.
- Export chart table: Dashboard -> Download Data.
- Map search: Dashboard -> Map -> choose scope -> Search.
- Manage users: Admin -> Account Management -> approve/role changes.
- Log out: Sign out -> Confirm.
