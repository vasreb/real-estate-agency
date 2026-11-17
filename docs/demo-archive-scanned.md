# Scanned (image-only) originals

Some originals are stored as **image-only PDFs**, to model documents that were
scanned or photographed instead of exported from a word processor. Each affected
deal is converted completely, so every file in an affected deal is a PDF with no
text layer.

## Scope

| Item                            | Value                         |
| ------------------------------- | ----------------------------- |
| Image-only documents, archive   | 241 of 2,400 (10.04%)         |
| Image-only documents, seed      | 1 of 3 (South team contract)  |
| Image-only documents, total     | 242 of 2,403 (10.07%)         |
| Pages rendered (archive)        | 468                           |
| Originally DOCX, now image PDF  | 23                            |
| Archive PDF / DOCX after change | 2,183 / 217 (was 2,160 / 240) |

Selection rule: the eight oldest archive deals by first document date
(2025-01-10 to 2025-01-12), taken as whole deals to reach ~10% of files
(241 documents). The South team contract is the image-only seed document.

| Deal       | Image-only documents |
| ---------- | -------------------- |
| `2025-001` | 29                   |
| `2025-002` | 27                   |
| `2025-003` | 29                   |
| `2025-011` | 33                   |
| `2025-012` | 32                   |
| `2025-013` | 31                   |
| `2025-021` | 32                   |
| `2025-022` | 28                   |

## Method

1. The canonical original (PDF or DOCX) was read from the database.
2. DOCX originals were converted to a plain text-layout PDF (text only, no
   styling).
3. Every page was rasterized with the Windows PDF renderer at 1000 px width and
   encoded as JPEG (quality 65).
4. Each image-only PDF has one full-page image per source page, with no fonts
   or text operators.

Scripts: [`tooling/demo-archive/scanned/make-scanned.mjs`](../tooling/demo-archive/scanned/make-scanned.mjs)
and [`render-batch.ps1`](../tooling/demo-archive/scanned/render-batch.ps1).
The per-document manifest is [`manifest.json`](../tooling/demo-archive/scanned/manifest.json).
The Windows renderer output can differ across systems, so a rerun may differ at
the pixel level. The SHA-256 values identify the exact stored bytes.

## Seed

The South team contract (`60000000-0000-4000-8000-000000000003`) is embedded
from [`apps/api/prisma/assets/south-contract-scan.jpg`](../apps/api/prisma/assets/south-contract-scan.jpg)
by `createScannedPdf` in [`apps/api/prisma/sample-documents.ts`](../apps/api/prisma/sample-documents.ts).

## Database change

The running archive database `agency_demo_archive` was updated in one
transaction: `file_data`, `mime_type` and `file_name` for the 241 archive rows.
Each DOCX row changed its file name extension to `.pdf`. Titles, numbers,
dates, parent links and deal links are unchanged.

## Documents

| Deal              | Document ID                            | Title                                                   | Format     | File name                  | Pages | SHA-256 (prefix)    |
| ----------------- | -------------------------------------- | ------------------------------------------------------- | ---------- | -------------------------- | ----- | ------------------- |
| `2025-001`        | `02502731-7e00-5775-ab02-12f263c90542` | Tenancy variation instrument                            | PDF        | `deal-001-amendment-4.pdf` | 2     | `d94d16e50621a563…` |
| `2025-001`        | `096a57e6-d143-5158-8aa1-9315c88b09f6` | Residential tenancy agreement                           | PDF        | `deal-001-document-6.pdf`  | 4     | `2704a5b2c8412718…` |
| `2025-001`        | `0c3491a1-1388-55fa-bf9f-671594074064` | Deposit deduction proposal and response                 | PDF        | `deal-001-document-14.pdf` | 1     | `27b3342e1ead660f…` |
| `2025-001`        | `1068fe03-b6bf-5493-8e3e-4a6f116d8d56` | Compliance and information delivery record              | PDF        | `deal-001-document-23.pdf` | 1     | `d7d0962a58191448…` |
| `2025-001`        | `1094243a-74e5-5d32-95cc-998cdc4de3aa` | Synthetic energy assessment source summary              | PDF        | `deal-001-document-24.pdf` | 1     | `de2c6fba6262a88a…` |
| `2025-001`        | `1c5c7f44-3430-53f4-b777-fcba20a5cf00` | Matter closing and open-items summary                   | PDF        | `deal-001-document-16.pdf` | 1     | `cc01005d60d8300d…` |
| `2025-001`        | `1db44033-5eb9-5054-9eea-0325a64b8ddb` | Repair scope and landlord authorisation                 | PDF        | `deal-001-document-18.pdf` | 2     | `a4d978245538267e…` |
| `2025-001`        | `33eece4b-7c7e-5982-bc21-b965f209a716` | Periodic inspection report                              | PDF        | `deal-001-document-17.pdf` | 2     | `4c7d5103f15ca0c0…` |
| `2025-001`        | `33fc6081-b174-53e1-b4f8-e072c14d830a` | Tenancy variation instrument                            | PDF        | `deal-001-amendment-2.pdf` | 2     | `fdfc4a24d3e58f64…` |
| `2025-001`        | `4ad248f7-b23d-56f9-b45d-66f0249d3951` | Deposit settlement and refund ledger                    | PDF        | `deal-001-document-15.pdf` | 2     | `d1a449e96905124a…` |
| `2025-001`        | `4e92d82c-5b02-50b9-a001-4cce12911130` | Management instruction amendment                        | PDF        | `deal-001-amendment-1.pdf` | 2     | `c393aedc5408ec68…` |
| `2025-001`        | `643972fc-1205-54fc-8feb-2aaf9dce8790` | Maintenance invoice and reconciliation                  | PDF        | `deal-001-document-20.pdf` | 2     | `7afe7586225a7807…` |
| `2025-001`        | `6d76dd2f-08a7-5a8b-8eec-4432c928ce1f` | Inventory discrepancy response                          | DOCX → PDF | `deal-001-document-25.pdf` | 1     | `3568f685b89e33c9…` |
| `2025-001`        | `708fe12d-f4f3-5ced-9296-35dfdd411381` | Comparative check-out report                            | PDF        | `deal-001-document-13.pdf` | 3     | `8a1265e377bd44f9…` |
| `2025-001`        | `924ccac4-e6d9-5760-9037-e62111f7789c` | Holding-deposit terms                                   | PDF        | `deal-001-document-3.pdf`  | 1     | `ba337ef7d9b834ef…` |
| `2025-001`        | `960df5a9-a90a-5446-8df1-f6f75a08666b` | Deposit protection and information demonstration record | PDF        | `deal-001-document-9.pdf`  | 1     | `c01c9e4f35b19057…` |
| `2025-001`        | `9f367563-dd30-552d-90bc-0a2e4f892a26` | Fictional contractor findings and work report           | PDF        | `deal-001-document-19.pdf` | 2     | `3ebe29f7b61c7bb2…` |
| `2025-001`        | `aa6f237a-dcaa-511f-b2f1-45caf260eadb` | Approved letting particulars                            | PDF        | `deal-001-document-2.pdf`  | 1     | `04f65c63605f9ff3…` |
| `2025-001`        | `b45bf216-6ebd-5e43-9464-80bc4093901c` | Synthetic referencing outcome                           | PDF        | `deal-001-document-5.pdf`  | 1     | `bc21b443129a9d87…` |
| `2025-001`        | `b647953d-8ed1-5e68-a496-3d36aba9617b` | Tenancy variation instrument                            | PDF        | `deal-001-amendment-3.pdf` | 2     | `fd7fafe677a89338…` |
| `2025-001`        | `bb243dd7-a5d6-565b-97f0-68c5915a508c` | Separate guarantor agreement                            | PDF        | `deal-001-document-7.pdf`  | 3     | `07f67c3b6877078b…` |
| `2025-001`        | `cd5de71d-83ae-57c3-b935-652919a11858` | Inventory and room condition schedule                   | DOCX → PDF | `deal-001-document-10.pdf` | 5     | `1f3e288d9fa559d9…` |
| `2025-001`        | `cf1cd704-34e9-5979-b929-3057bbfd6358` | Holding-deposit receipt and allocation                  | PDF        | `deal-001-document-4.pdf`  | 1     | `b306f90f4b90c8a5…` |
| `2025-001`        | `d4bd5497-2d86-59b0-be9f-ce41b7ca3793` | Agreed tenancy-ending record                            | PDF        | `deal-001-document-12.pdf` | 2     | `b310de2a5ebd2981…` |
| `2025-001`        | `d86138d2-74df-5733-a174-fd649947154a` | Rent account statement                                  | DOCX → PDF | `deal-001-document-21.pdf` | 1     | `6638d789cdd203cc…` |
| `2025-001`        | `d887cf0e-f991-52df-bf9f-05ec71e98171` | Tenancy-deposit receipt                                 | PDF        | `deal-001-document-8.pdf`  | 1     | `171e89a29983e0f0…` |
| `2025-001`        | `f3ed6cb8-e9ad-5fb5-ba62-6a6c651a1ad3` | Landlord property-management agreement                  | PDF        | `deal-001-document-1.pdf`  | 4     | `6e63bdf9e6cd49f1…` |
| `2025-001`        | `fc821847-737b-5fd9-9ebc-a19a980cd100` | Check-in and alarm handover                             | PDF        | `deal-001-document-11.pdf` | 1     | `6e5180f34030523b…` |
| `2025-001`        | `ff5bbc78-31fb-5161-b810-0e805ec5c514` | Synthetic electrical report extract                     | PDF        | `deal-001-document-22.pdf` | 1     | `02e1f6a089f031fc…` |
| `2025-011`        | `026dc0b5-e133-5cb6-a8b4-83a637c23b58` | Management instruction amendment                        | PDF        | `deal-011-amendment-1.pdf` | 2     | `5adf23f46fbdacee…` |
| `2025-011`        | `037ce761-336c-5c84-926d-e6dd24b97c3c` | Repair scope and landlord authorisation                 | PDF        | `deal-011-document-18.pdf` | 2     | `173e87421e5647ee…` |
| `2025-011`        | `05b86196-b0bd-56c9-bd6f-e0493c80a14a` | Deposit protection and information demonstration record | PDF        | `deal-011-document-9.pdf`  | 1     | `812aa1ba63526ad8…` |
| `2025-011`        | `065009e8-a913-5c4f-b237-7cfe7be4aa6c` | Synthetic energy assessment source summary              | PDF        | `deal-011-document-24.pdf` | 1     | `9f1677f3d7468296…` |
| `2025-011`        | `150efc1a-b56d-5cd5-8efb-e88a02905c31` | Periodic inspection report                              | PDF        | `deal-011-document-17.pdf` | 2     | `b348b57d79774df5…` |
| `2025-011`        | `3db2a8de-42b7-5a43-b75c-c03fc8b14c8b` | Key custody change record                               | PDF        | `deal-011-document-27.pdf` | 2     | `fb25ce443a1955fe…` |
| `2025-011`        | `4270d9dd-95ab-5f80-9d4d-12fe25719a98` | Matter closing and open-items summary                   | PDF        | `deal-011-document-16.pdf` | 1     | `431b4b4165ef2b9b…` |
| `2025-011`        | `4915ff4a-13c6-5366-bcdc-39cce4903866` | Approved letting particulars                            | PDF        | `deal-011-document-2.pdf`  | 1     | `60303e683c6e7528…` |
| `2025-011`        | `4e0f545c-d757-59a3-bd0b-3902fae84c0c` | Document delivery acknowledgement                       | PDF        | `deal-011-document-29.pdf` | 1     | `d14b71b8dc59c6bc…` |
| `2025-011`        | `529c2ec7-9ea1-5b4f-91e9-73f902e9afdc` | Deposit settlement and refund ledger                    | PDF        | `deal-011-document-15.pdf` | 2     | `f6dddb2ea448e1f8…` |
| `2025-011`        | `5d4b59d1-ebc2-5019-b6ac-a72395b97630` | Holding-deposit receipt and allocation                  | PDF        | `deal-011-document-4.pdf`  | 1     | `83573b4ab84deede…` |
| `2025-011`        | `5e448556-d609-5f28-8842-34e8bae5f9f8` | Landlord property-management agreement                  | PDF        | `deal-011-document-1.pdf`  | 4     | `7e551e5bed431822…` |
| `2025-011`        | `5f08a3b6-8d79-5908-b941-4f5a5184ccb8` | Compliance and information delivery record              | PDF        | `deal-011-document-23.pdf` | 1     | `586b31a2b9231bcd…` |
| `2025-011`        | `6d07c429-1e39-5f1f-9a08-620bd550a8b3` | Historical-source receipt note                          | PDF        | `deal-011-document-28.pdf` | 2     | `394dcff8880962af…` |
| `2025-011`        | `760e4865-d265-56d7-b09a-54e7100920db` | Maintenance invoice and reconciliation                  | PDF        | `deal-011-document-20.pdf` | 2     | `7d90354a824d7a6d…` |
| `2025-011`        | `7ad7d52f-8f2b-50db-9489-49e62b708ceb` | Synthetic gas safety record extract                     | PDF        | `deal-011-document-25.pdf` | 2     | `c43c26b7179ca668…` |
| `2025-011`        | `84e6cb54-7d06-50ea-a122-d2d540f431d8` | Separate guarantor agreement                            | DOCX → PDF | `deal-011-document-7.pdf`  | 3     | `c5028adfb61f6a64…` |
| `2025-011`        | `8e8d2445-7b64-5099-af60-73f4b806f221` | Inventory discrepancy response                          | PDF        | `deal-011-document-26.pdf` | 1     | `822d60b394537d36…` |
| `2025-011`        | `91f144a9-a65f-55e5-add8-c8c0f42430cb` | Synthetic referencing outcome                           | PDF        | `deal-011-document-5.pdf`  | 1     | `a409b4c75bd5ac2c…` |
| `2025-011`        | `9de1881e-2a6c-5930-b5e1-43b5eb6cf0e0` | Deposit deduction proposal and response                 | PDF        | `deal-011-document-14.pdf` | 1     | `7092ea8de4159069…` |
| `2025-011`        | `c58fb95c-bd1d-501f-8d5f-321987870ce8` | Rent account statement                                  | PDF        | `deal-011-document-21.pdf` | 1     | `b3a89b67d36c7b12…` |
| `2025-011`        | `cc33a554-2b3b-547e-9829-8991ee5d7ff3` | Inventory and room condition schedule                   | PDF        | `deal-011-document-10.pdf` | 9     | `2db43f8c87cf111d…` |
| `2025-011`        | `cdf080ba-58ec-59a9-bf78-9b7353805c60` | Tenancy-deposit receipt                                 | PDF        | `deal-011-document-8.pdf`  | 1     | `5810367e7fa0b3f7…` |
| `2025-011`        | `d0fcdb2b-d4f0-5087-bbca-0a523ef4aabf` | Holding-deposit terms                                   | PDF        | `deal-011-document-3.pdf`  | 1     | `67241e6853209de6…` |
| `2025-011`        | `d17818b5-ae8d-5037-a469-7f4f8dfb6116` | Comparative check-out report                            | PDF        | `deal-011-document-13.pdf` | 6     | `96b164dcba35a1ec…` |
| `2025-011`        | `d83e35f2-e19b-5935-af27-6514798e4051` | Synthetic electrical report extract                     | PDF        | `deal-011-document-22.pdf` | 1     | `9567437e8882e18f…` |
| `2025-011`        | `e2bb97ce-eea0-59c6-8fea-409ba550784b` | Agreed tenancy-ending record                            | PDF        | `deal-011-document-12.pdf` | 2     | `c42dd96e962a8910…` |
| `2025-011`        | `e3f87276-061d-58d9-96f8-e2c6ca0a8fcd` | Residential tenancy agreement                           | PDF        | `deal-011-document-6.pdf`  | 4     | `8ed8bbff189ac051…` |
| `2025-011`        | `e678a9a1-92a0-5e66-8ed9-5576e04507c4` | Check-in and alarm handover                             | PDF        | `deal-011-document-11.pdf` | 2     | `747a7e06fc058989…` |
| `2025-011`        | `ee4506f9-200b-5319-acfe-7fbc4517dede` | Tenancy variation instrument                            | PDF        | `deal-011-amendment-3.pdf` | 2     | `6c07f58e44784134…` |
| `2025-011`        | `f0d5b562-a4b6-5898-a066-2f4ccd708eb7` | Tenancy variation instrument                            | PDF        | `deal-011-amendment-2.pdf` | 2     | `b7de127463760687…` |
| `2025-011`        | `f3989187-0f2c-591a-b24c-9a37013c19a5` | Fictional contractor findings and work report           | PDF        | `deal-011-document-19.pdf` | 2     | `057a7f15e5bfb5b9…` |
| `2025-011`        | `f865fecf-0d1a-553b-a119-91ee3e8d5a87` | Tenancy variation instrument                            | PDF        | `deal-011-amendment-4.pdf` | 2     | `92d974da8ed34532…` |
| `2025-021`        | `01bec0cf-754f-5614-b8d4-651df6d0d69d` | Periodic inspection report                              | PDF        | `deal-021-document-17.pdf` | 2     | `8043a35aa7a7b873…` |
| `2025-021`        | `0b928b43-79dd-504e-8825-29b341e57b9a` | Tenancy variation instrument                            | PDF        | `deal-021-amendment-3.pdf` | 2     | `bbaffee876e835fd…` |
| `2025-021`        | `1164524d-392d-5a85-a3b8-13f9d0a6d90f` | Deposit protection and information demonstration record | PDF        | `deal-021-document-9.pdf`  | 1     | `2bda07b6c5f62e93…` |
| `2025-021`        | `19eba921-6458-55bf-8710-98166a2ebe3f` | Synthetic referencing outcome                           | DOCX → PDF | `deal-021-document-5.pdf`  | 1     | `c864fe7b0048e518…` |
| `2025-021`        | `2ac40ea9-f042-52cc-baee-adcdbcbf09f5` | Historical-source receipt note                          | PDF        | `deal-021-document-27.pdf` | 2     | `53f252f16af1861b…` |
| `2025-021`        | `2b8c2ea7-6d32-52cc-b4a3-958e22fd62f9` | Tenancy variation instrument                            | PDF        | `deal-021-amendment-2.pdf` | 2     | `cf44c483108a16f4…` |
| `2025-021`        | `359888e1-a4dd-5669-ab87-00db9fa10362` | Synthetic energy assessment source summary              | PDF        | `deal-021-document-24.pdf` | 1     | `72e9a14c007fa4ea…` |
| `2025-021`        | `51ca2748-93a6-55cd-9db9-083648998197` | Inventory and room condition schedule                   | DOCX → PDF | `deal-021-document-10.pdf` | 7     | `6417bc107ac9959c…` |
| `2025-021`        | `687621b8-7cc0-5a56-b1a9-b21db8b0c24e` | Maintenance invoice and reconciliation                  | PDF        | `deal-021-document-20.pdf` | 2     | `74646624942141d9…` |
| `2025-021`        | `6d48f39e-9719-59bd-8ae3-5ad13276da5b` | Rent account statement                                  | PDF        | `deal-021-document-21.pdf` | 1     | `55131c5e590079c5…` |
| `2025-021`        | `6f71da23-5fcf-5cc8-81d2-44d73ce5b26f` | Matter closing and open-items summary                   | PDF        | `deal-021-document-16.pdf` | 1     | `3a9409699cbec93e…` |
| `2025-021`        | `75726548-e81b-5784-b6a7-2f64a4cb558b` | Residential tenancy agreement                           | PDF        | `deal-021-document-6.pdf`  | 4     | `672d3b2edf7772f1…` |
| `2025-021`        | `7883324d-1c2e-523b-8f20-1f8118d05378` | Deposit deduction proposal and response                 | PDF        | `deal-021-document-14.pdf` | 1     | `db072539e13eab78…` |
| `2025-021`        | `7c0a6e29-035b-5d1f-ae05-4003e34602d9` | Agreed tenancy-ending record                            | PDF        | `deal-021-document-12.pdf` | 2     | `8782655c5a1ca42d…` |
| `2025-021`        | `83832a00-6f87-5f6c-bb19-3753ed2f2049` | Synthetic electrical report extract                     | PDF        | `deal-021-document-22.pdf` | 1     | `7ccd279ac05976d9…` |
| `2025-021`        | `8a4f2488-94b9-5085-94a9-7b965b89ecd6` | Approved letting particulars                            | PDF        | `deal-021-document-2.pdf`  | 1     | `dc2f7f14ac5a4e91…` |
| `2025-021`        | `96360626-881a-5ee0-8984-4ee4d35ce9eb` | Management instruction amendment                        | PDF        | `deal-021-amendment-1.pdf` | 2     | `7637eb1baa06928d…` |
| `2025-021`        | `9fba33ff-1eb7-5b51-bcae-3a50fe8e07b0` | Document delivery acknowledgement                       | DOCX → PDF | `deal-021-document-28.pdf` | 1     | `726b614704dc57ec…` |
| `2025-021`        | `a69367c2-eafc-52d5-b8a2-cd05ce84f069` | Fictional contractor findings and work report           | PDF        | `deal-021-document-19.pdf` | 2     | `39163e4299c6b292…` |
| `2025-021`        | `ac1c7ba7-9bb4-54d2-8c32-81c5ff4c67a1` | Key custody change record                               | PDF        | `deal-021-document-26.pdf` | 2     | `20bae9cd64c9122a…` |
| `2025-021`        | `afc5995c-de0b-5679-9984-76f5f7380831` | Landlord property-management agreement                  | DOCX → PDF | `deal-021-document-1.pdf`  | 4     | `329c4e8c5fcc9435…` |
| `2025-021`        | `b71bc140-a144-5e31-acdc-828ec4994842` | Check-in and alarm handover                             | PDF        | `deal-021-document-11.pdf` | 1     | `11746d717b33715c…` |
| `2025-021`        | `bc63feb2-30bb-5a01-8730-b1486fbd1f1e` | Holding-deposit terms                                   | PDF        | `deal-021-document-3.pdf`  | 1     | `d4a9a5c2f6680a85…` |
| `2025-021`        | `c9451f1c-693e-51a4-81ad-a10698c116e5` | Deposit settlement and refund ledger                    | PDF        | `deal-021-document-15.pdf` | 2     | `1e61b7cf2181b538…` |
| `2025-021`        | `cbcea8c0-8178-525b-b2d5-40308255c599` | Separate guarantor agreement                            | DOCX → PDF | `deal-021-document-7.pdf`  | 3     | `43278a96af27ed01…` |
| `2025-021`        | `cd5f161a-f97c-5f78-9ccb-71662753bbec` | Holding-deposit receipt and allocation                  | PDF        | `deal-021-document-4.pdf`  | 1     | `571b777e153ff002…` |
| `2025-021`        | `cfa293cd-4055-5a43-aef6-cf593b3d2186` | Compliance and information delivery record              | DOCX → PDF | `deal-021-document-23.pdf` | 1     | `82b662a796712800…` |
| `2025-021`        | `d06830f5-4d3f-5936-94fa-80505ba4da67` | Inventory discrepancy response                          | PDF        | `deal-021-document-25.pdf` | 1     | `b5c33a678483de36…` |
| `2025-021`        | `de4361b5-753a-5732-a43d-f3da1ac731eb` | Repair scope and landlord authorisation                 | PDF        | `deal-021-document-18.pdf` | 2     | `7f113f1624d2c1d4…` |
| `2025-021`        | `e595279c-77e6-58bd-baed-c75888fa60fe` | Tenancy variation instrument                            | PDF        | `deal-021-amendment-4.pdf` | 2     | `b6c7e62cc6441cdd…` |
| `2025-021`        | `e6b1b74e-4580-5a1f-94ac-32990e238a72` | Comparative check-out report                            | PDF        | `deal-021-document-13.pdf` | 4     | `3623831d6390f55c…` |
| `2025-021`        | `f9ff9e8c-c48c-5292-8d8d-72e0c74340f4` | Tenancy-deposit receipt                                 | PDF        | `deal-021-document-8.pdf`  | 1     | `e96b9dc62aea8905…` |
| `2025-002`        | `04330879-3105-5b0c-a106-0473ee423352` | Fictional contractor findings and work report           | PDF        | `deal-002-document-18.pdf` | 2     | `ff4c243ff8a18723…` |
| `2025-002`        | `0cfd5470-845e-5a41-b0ec-cbfbff82d90b` | Tenancy variation instrument                            | PDF        | `deal-002-amendment-3.pdf` | 2     | `ba3cac23c8ed6d8b…` |
| `2025-002`        | `104172b0-e6ba-539b-971e-60c03f15fc62` | Approved letting particulars                            | PDF        | `deal-002-document-2.pdf`  | 1     | `ce02c97fb877b01c…` |
| `2025-002`        | `141ee131-3563-5b8c-ba37-53a7b847dd38` | Agreed tenancy-ending record                            | PDF        | `deal-002-document-11.pdf` | 2     | `830133d0450834d3…` |
| `2025-002`        | `14277985-2aab-5717-9903-c8ad05466368` | Deposit protection and information demonstration record | PDF        | `deal-002-document-8.pdf`  | 1     | `ca9041354fc5a37c…` |
| `2025-002`        | `1470d060-e04a-501c-b8f8-66c4adbe95f8` | Tenancy variation instrument                            | PDF        | `deal-002-amendment-4.pdf` | 2     | `1410e3f9a925981a…` |
| `2025-002`        | `1b43f608-26c7-51cb-912d-c00a8c676f0e` | Rent account statement                                  | PDF        | `deal-002-document-20.pdf` | 1     | `b3b0ec657d5cb96c…` |
| `2025-002`        | `1d9fb2ee-4265-57b7-bc66-6b03f534e507` | Holding-deposit receipt and allocation                  | PDF        | `deal-002-document-4.pdf`  | 1     | `104600bc13943122…` |
| `2025-002`        | `2c7ea168-ed79-5520-8b3c-b19e2a45df13` | Deposit settlement and refund ledger                    | PDF        | `deal-002-document-14.pdf` | 2     | `145661708a9717b0…` |
| `2025-002`        | `2e8378a9-6779-562f-ac50-9e2b77a5da89` | Holding-deposit terms                                   | PDF        | `deal-002-document-3.pdf`  | 1     | `1c9ec90deb912f26…` |
| `2025-002`        | `454c28b7-b461-57a3-a784-986b8618e189` | Tenancy variation instrument                            | PDF        | `deal-002-amendment-2.pdf` | 2     | `ef36cddfcc345cc5…` |
| `2025-002`        | `4646255f-3c37-5949-8e52-c70ed17b296d` | Periodic inspection report                              | PDF        | `deal-002-document-16.pdf` | 2     | `65d8653aada775d6…` |
| `2025-002`        | `53923f2d-227b-5a83-9568-11d1b9d6732e` | Synthetic energy assessment source summary              | PDF        | `deal-002-document-23.pdf` | 1     | `d2a91deadcb92a43…` |
| `2025-002`        | `57ab080b-bf17-5bd1-9e31-08999aab40c8` | Residential tenancy agreement                           | DOCX → PDF | `deal-002-document-6.pdf`  | 4     | `9ab4d9c215ff81ef…` |
| `2025-002`        | `6a782715-7f31-5d6a-9f1e-659831f147e7` | Compliance and information delivery record              | PDF        | `deal-002-document-22.pdf` | 1     | `4c124af71abf64a3…` |
| `2025-002`        | `6ad75b97-a767-5cf1-9477-cd56d4ebb39d` | Synthetic referencing outcome                           | DOCX → PDF | `deal-002-document-5.pdf`  | 1     | `c225116d35212f36…` |
| `2025-002`        | `8360448a-1f96-5344-8cb4-dc564cff01b7` | Check-in and alarm handover                             | PDF        | `deal-002-document-10.pdf` | 2     | `1106bb937ec80936…` |
| `2025-002`        | `887a626e-19dd-5811-b355-77aba4f5468a` | Matter closing and open-items summary                   | PDF        | `deal-002-document-15.pdf` | 1     | `429abbb4211a8b3d…` |
| `2025-002`        | `96591bf4-32ec-510a-bf68-04310d53b466` | Tenancy-deposit receipt                                 | PDF        | `deal-002-document-7.pdf`  | 1     | `0ba056dcc3e33d87…` |
| `2025-002`        | `9834d3aa-a37b-5b2f-9190-5051900e9120` | Management instruction amendment                        | PDF        | `deal-002-amendment-1.pdf` | 2     | `459b85d43fd67bd2…` |
| `2025-002`        | `9eff3550-431b-5e49-9657-78d171a694be` | Inventory and room condition schedule                   | PDF        | `deal-002-document-9.pdf`  | 6     | `cfea2be762333cc1…` |
| `2025-002`        | `a4d0f07d-d25a-5098-bc0e-373d208a4840` | Synthetic electrical report extract                     | PDF        | `deal-002-document-21.pdf` | 1     | `95f6a1b7ace0309e…` |
| `2025-002`        | `b17c1308-8975-5847-8b23-fcd7bdd10acc` | Deposit deduction proposal and response                 | PDF        | `deal-002-document-13.pdf` | 1     | `d2dd0c6000c90e68…` |
| `2025-002`        | `bdc56095-4c43-5082-ae06-978f245360f5` | Landlord property-management agreement                  | PDF        | `deal-002-document-1.pdf`  | 4     | `52ede6b3c6cc7987…` |
| `2025-002`        | `e5e323fa-ebef-5bb2-bdeb-3e23c13210a1` | Repair scope and landlord authorisation                 | PDF        | `deal-002-document-17.pdf` | 2     | `417dc5d9d0e4e456…` |
| `2025-002`        | `eb886347-4771-5b4e-8dcf-4c1447527f93` | Maintenance invoice and reconciliation                  | PDF        | `deal-002-document-19.pdf` | 2     | `0a7bd3d0e4d89808…` |
| `2025-002`        | `f7ad3d82-77f7-518b-a8cb-da5fca6a3f78` | Comparative check-out report                            | PDF        | `deal-002-document-12.pdf` | 4     | `d7c67c23a8391673…` |
| `2025-012`        | `0bca90d6-3e96-501f-8b1a-af0b3bd378e2` | Approved letting particulars                            | PDF        | `deal-012-document-2.pdf`  | 1     | `bbf8089050507aac…` |
| `2025-012`        | `0d9df5eb-1e88-5ec1-ae2d-c4adb3152dc7` | Tenancy variation instrument                            | PDF        | `deal-012-amendment-2.pdf` | 2     | `7dc340f3bb8b2ac2…` |
| `2025-012`        | `1446b626-074d-5490-bcab-58e7fe426749` | Holding-deposit receipt and allocation                  | PDF        | `deal-012-document-4.pdf`  | 1     | `62ddf3cfc617680c…` |
| `2025-012`        | `2148ea3f-6cbc-59ad-9a54-15ab5cd3fd61` | Compliance and information delivery record              | PDF        | `deal-012-document-22.pdf` | 1     | `fbc976d15cc654ab…` |
| `2025-012`        | `237720bd-8a6b-5a8d-9285-56b84cfa66b9` | Tenancy variation instrument                            | PDF        | `deal-012-amendment-4.pdf` | 2     | `0ca73d43ce521f21…` |
| `2025-012`        | `25ce3854-1052-521f-9bee-af960e164205` | Maintenance invoice and reconciliation                  | PDF        | `deal-012-document-19.pdf` | 2     | `432087b0a5bfc060…` |
| `2025-012`        | `273f7c39-281c-5d47-a532-50c7fcb5ed8e` | Rent account statement                                  | PDF        | `deal-012-document-20.pdf` | 1     | `c26ee840cacfd96f…` |
| `2025-012`        | `40208f1a-fe0a-5cc5-9049-bba7a6dfd255` | Inventory and room condition schedule                   | PDF        | `deal-012-document-9.pdf`  | 6     | `3f77ba4c74cc75e1…` |
| `2025-012`        | `4a94c257-397c-585b-9627-c6e08a8078af` | Key custody change record                               | PDF        | `deal-012-document-26.pdf` | 2     | `31eb528cd2af265d…` |
| `2025-012`        | `5e891b72-1d61-59c6-b794-f85e924b4e61` | Landlord property-management agreement                  | PDF        | `deal-012-document-1.pdf`  | 4     | `86837fb54a7fe1e8…` |
| `2025-012`        | `7296026c-1fd8-5249-bf6a-a75c3fa601e9` | Holding-deposit terms                                   | PDF        | `deal-012-document-3.pdf`  | 1     | `1f085711feae64ca…` |
| `2025-012`        | `809a6f9a-9333-524d-87d1-8a49da81cc24` | Repair scope and landlord authorisation                 | PDF        | `deal-012-document-17.pdf` | 2     | `f98dc9111583cc0a…` |
| `2025-012`        | `8ad1d5e9-8cd5-55df-9588-279c4ca2dec3` | Comparative check-out report                            | DOCX → PDF | `deal-012-document-12.pdf` | 4     | `29bf5e5f66d86d02…` |
| `2025-012`        | `8c182302-c6b0-57bf-809b-1aa99ba51cf8` | Agreed tenancy-ending record                            | PDF        | `deal-012-document-11.pdf` | 2     | `ea19cae89659f72c…` |
| `2025-012`        | `91dff92a-79f6-5b50-bbf7-f24b493dd274` | Matter closing and open-items summary                   | PDF        | `deal-012-document-15.pdf` | 1     | `7617839efedaae94…` |
| `2025-012`        | `9288a6dc-7263-50ac-84cc-c116b34d9b02` | Historical-source receipt note                          | PDF        | `deal-012-document-27.pdf` | 2     | `6e0db3bc0e350281…` |
| `2025-012`        | `b014716a-a98b-5e22-a792-b276c01e548f` | Synthetic gas safety record extract                     | PDF        | `deal-012-document-24.pdf` | 2     | `40e3995a59f15768…` |
| `2025-012`        | `b1b674a9-b44a-5e76-92bd-bfc4ab780c62` | Inventory discrepancy response                          | PDF        | `deal-012-document-25.pdf` | 1     | `63a8c263fdaa8b2d…` |
| `2025-012`        | `b558afe0-6d3f-5d93-ad2f-e37b9d44d54f` | Fictional contractor findings and work report           | PDF        | `deal-012-document-18.pdf` | 2     | `bc44982d1a81de31…` |
| `2025-012`        | `b5af780e-1bd2-54e5-8071-854ce42883ab` | Tenancy variation instrument                            | PDF        | `deal-012-amendment-3.pdf` | 2     | `313e27ce36aba118…` |
| `2025-012`        | `b9ec28bb-3aee-5997-b8a8-5bec2416b62b` | Deposit deduction proposal and response                 | DOCX → PDF | `deal-012-document-13.pdf` | 1     | `380d4d6fa48eee89…` |
| `2025-012`        | `bb5eef3d-46f7-5470-8f70-aeb5fe06d652` | Deposit settlement and refund ledger                    | PDF        | `deal-012-document-14.pdf` | 2     | `8b0cd38014421c20…` |
| `2025-012`        | `bd8ef928-f3c2-581e-9287-1597b64b7109` | Synthetic energy assessment source summary              | PDF        | `deal-012-document-23.pdf` | 1     | `eccd94b9c6a90e9d…` |
| `2025-012`        | `c94234d0-8389-5035-b205-e9497b67e23e` | Residential tenancy agreement                           | PDF        | `deal-012-document-6.pdf`  | 4     | `3cdecfbd976cd1ae…` |
| `2025-012`        | `cc18e6e1-e7f7-5c20-8323-fa0c780de24c` | Synthetic referencing outcome                           | PDF        | `deal-012-document-5.pdf`  | 1     | `2bcefd80346abd3c…` |
| `2025-012`        | `ce4364ec-239e-573f-a4e1-58efc1e15ea8` | Synthetic electrical report extract                     | PDF        | `deal-012-document-21.pdf` | 1     | `2a80aa3ba534bee6…` |
| `2025-012`        | `dacac87c-c830-5576-bc3d-2c1dc6bccfea` | Management instruction amendment                        | PDF        | `deal-012-amendment-1.pdf` | 2     | `017a38b987505f2e…` |
| `2025-012`        | `dda3b908-c6e2-5891-9165-a5e7d1c866f4` | Tenancy-deposit receipt                                 | DOCX → PDF | `deal-012-document-7.pdf`  | 2     | `c6bf399c7ee53046…` |
| `2025-012`        | `e412ac16-16b3-5223-9224-04710fc55b70` | Periodic inspection report                              | PDF        | `deal-012-document-16.pdf` | 2     | `b50436722cada20e…` |
| `2025-012`        | `f212da50-155a-507c-ba9e-8af7caf065bf` | Deposit protection and information demonstration record | PDF        | `deal-012-document-8.pdf`  | 1     | `f5cbc110ed13ef6f…` |
| `2025-012`        | `faa9216b-64f8-53eb-8eb1-d3f6886a8fb5` | Check-in and alarm handover                             | PDF        | `deal-012-document-10.pdf` | 2     | `642a934843e218fb…` |
| `2025-012`        | `fc529625-95fe-5de9-b466-3d2e1f4fcd90` | Document delivery acknowledgement                       | PDF        | `deal-012-document-28.pdf` | 1     | `97da0e5cb08b4ab4…` |
| `2025-022`        | `088c7f42-7b5e-5091-a1c2-7d3ecfea8f9b` | Holding-deposit receipt and allocation                  | PDF        | `deal-022-document-4.pdf`  | 1     | `874fc96779a3f6f4…` |
| `2025-022`        | `12ac37bd-415a-5ea1-8bb2-f7e231ef825b` | Tenancy variation instrument                            | PDF        | `deal-022-amendment-3.pdf` | 2     | `799dbae35b1f957c…` |
| `2025-022`        | `1544054f-da62-5abd-b5d4-6b7f248b0168` | Holding-deposit terms                                   | PDF        | `deal-022-document-3.pdf`  | 1     | `124f5faff49960b7…` |
| `2025-022`        | `1c9f786c-0cf4-5e90-9870-b433a116e5cd` | Approved letting particulars                            | PDF        | `deal-022-document-2.pdf`  | 1     | `ada5da054e078a8a…` |
| `2025-022`        | `2e85d399-cce6-5670-b517-aa5458e6f779` | Landlord property-management agreement                  | PDF        | `deal-022-document-1.pdf`  | 4     | `95f8333081f987cd…` |
| `2025-022`        | `341e518b-0660-580d-a142-ed4bb16555dd` | Comparative check-out report                            | PDF        | `deal-022-document-12.pdf` | 3     | `238f18ec4e7f0dca…` |
| `2025-022`        | `37649c96-199f-5b94-a2ff-acc10782434d` | Management instruction amendment                        | PDF        | `deal-022-amendment-1.pdf` | 2     | `d795247b98864c7e…` |
| `2025-022`        | `379dc952-b5d6-54d0-8b53-cc7065f55db3` | Matter closing and open-items summary                   | PDF        | `deal-022-document-15.pdf` | 1     | `8b11ac527c515968…` |
| `2025-022`        | `3e0ff9b5-99c2-549f-9f3b-3b276238b2e8` | Check-in and alarm handover                             | PDF        | `deal-022-document-10.pdf` | 2     | `2a921fbc2df6d6d4…` |
| `2025-022`        | `4cf7d7c5-130f-5bc9-a53b-8e3dc3d4aad4` | Repair scope and landlord authorisation                 | PDF        | `deal-022-document-17.pdf` | 2     | `e68f7bae1886ff2e…` |
| `2025-022`        | `75c0a9ca-3ad5-5112-a782-92209a3e76b4` | Synthetic energy assessment source summary              | PDF        | `deal-022-document-23.pdf` | 1     | `4c351b15f9bc278e…` |
| `2025-022`        | `75d583a4-6920-53a9-a392-084d4b77f60b` | Deposit settlement and refund ledger                    | PDF        | `deal-022-document-14.pdf` | 2     | `388486e979264dda…` |
| `2025-022`        | `8017c13b-02a6-53a9-b6d2-c0b5829ab28b` | Agreed tenancy-ending record                            | PDF        | `deal-022-document-11.pdf` | 2     | `304890b87791cd21…` |
| `2025-022`        | `8433c2f5-86b7-579f-a8ad-0346d5e02092` | Deposit deduction proposal and response                 | PDF        | `deal-022-document-13.pdf` | 1     | `eb1c9ac5f1f9de78…` |
| `2025-022`        | `8c02012a-31dc-5008-894b-352f59e7891b` | Residential tenancy agreement                           | PDF        | `deal-022-document-6.pdf`  | 4     | `3ded1673b5b8a843…` |
| `2025-022`        | `8ff67ea0-f316-5510-b5ba-f5b3153d515b` | Maintenance invoice and reconciliation                  | PDF        | `deal-022-document-19.pdf` | 2     | `a430cdd596edba97…` |
| `2025-022`        | `93c45354-13a4-5249-bee8-c4346209b138` | Fictional contractor findings and work report           | PDF        | `deal-022-document-18.pdf` | 2     | `9c0b3cc5cfea40ee…` |
| `2025-022`        | `a6c237cf-c8c3-580f-8490-2ec6015c3b99` | Inventory and room condition schedule                   | PDF        | `deal-022-document-9.pdf`  | 5     | `63e1b543c0b1c4a1…` |
| `2025-022`        | `aae42424-cf72-556a-a73e-2bb91c062ef4` | Synthetic gas safety record extract                     | PDF        | `deal-022-document-24.pdf` | 2     | `a20a285fae3ca498…` |
| `2025-022`        | `acd21306-2161-5df6-bad1-07d42021cae2` | Tenancy-deposit receipt                                 | PDF        | `deal-022-document-7.pdf`  | 1     | `5e538c8fdb3cf936…` |
| `2025-022`        | `b666b19e-3138-5707-b802-05225b874322` | Synthetic electrical report extract                     | PDF        | `deal-022-document-21.pdf` | 1     | `66fa5697f2f71eff…` |
| `2025-022`        | `c0afb204-a83f-596e-877f-99bf592625aa` | Deposit protection and information demonstration record | DOCX → PDF | `deal-022-document-8.pdf`  | 1     | `274147b7acaf2009…` |
| `2025-022`        | `c70021ab-d4db-5bef-ada0-f1aaf8947704` | Tenancy variation instrument                            | PDF        | `deal-022-amendment-2.pdf` | 2     | `df9ce92de7ce9fed…` |
| `2025-022`        | `d07bea9b-1f54-53dd-ae42-b1612231a695` | Synthetic referencing outcome                           | PDF        | `deal-022-document-5.pdf`  | 1     | `44f142d3ff9b0e87…` |
| `2025-022`        | `db604ceb-76f0-5aa5-8199-ac8ea73b088d` | Rent account statement                                  | DOCX → PDF | `deal-022-document-20.pdf` | 1     | `719730cc344902d9…` |
| `2025-022`        | `e5859fb3-81cf-53a7-a1d3-af943bf0ce65` | Periodic inspection report                              | PDF        | `deal-022-document-16.pdf` | 2     | `80b4cfabe3b5fbf6…` |
| `2025-022`        | `f2fc1419-5f5d-503e-b360-faafb82b5b0f` | Tenancy variation instrument                            | PDF        | `deal-022-amendment-4.pdf` | 2     | `897bafe1bb4f6698…` |
| `2025-022`        | `f9ae0ccf-b182-5f0b-a5a3-f3f2e24c9605` | Compliance and information delivery record              | PDF        | `deal-022-document-22.pdf` | 1     | `5150319c43934a58…` |
| `2025-003`        | `116ec758-4da5-5985-b46c-04dcbb272542` | Synthetic referencing outcome                           | PDF        | `deal-003-document-5.pdf`  | 1     | `dd9ab30b4391ee4f…` |
| `2025-003`        | `16591f16-a708-5625-9397-7ecef7bb0ab2` | Fictional contractor findings and work report           | PDF        | `deal-003-document-18.pdf` | 2     | `c213b6877a654225…` |
| `2025-003`        | `1a135be6-2cec-5ff5-bc23-ee32bb67654d` | Tenancy-deposit receipt                                 | PDF        | `deal-003-document-7.pdf`  | 1     | `4e351c5ea35202a9…` |
| `2025-003`        | `206551fd-5480-5988-bc1b-766726321e24` | Deposit deduction proposal and response                 | PDF        | `deal-003-document-13.pdf` | 1     | `786ab5b30d09b0ff…` |
| `2025-003`        | `20efc499-5811-5bb1-811d-d225d0c6234a` | Residential tenancy agreement                           | DOCX → PDF | `deal-003-document-6.pdf`  | 4     | `bff254c6391b9ebe…` |
| `2025-003`        | `270a40d8-613a-53f5-8c09-18cd3e9f835f` | Agreed tenancy-ending record                            | PDF        | `deal-003-document-11.pdf` | 2     | `4204c26926a4bff9…` |
| `2025-003`        | `29a2d178-2d9b-5355-aa2c-f01aaaaf3b66` | Landlord property-management agreement                  | PDF        | `deal-003-document-1.pdf`  | 4     | `de9dca7e28007598…` |
| `2025-003`        | `2b8c6b98-5770-523d-825e-610f882570ef` | Matter closing and open-items summary                   | PDF        | `deal-003-document-15.pdf` | 1     | `6101450964af18a4…` |
| `2025-003`        | `2c90a55f-b6e8-5d3b-9d7f-a001f6dd01d8` | Deposit settlement and refund ledger                    | PDF        | `deal-003-document-14.pdf` | 2     | `943a4777a8d45255…` |
| `2025-003`        | `306badc9-735b-50c6-968e-0610f0d44ccc` | Inventory discrepancy response                          | PDF        | `deal-003-document-25.pdf` | 1     | `ca7ea551f3ae204f…` |
| `2025-003`        | `3e986e79-12b6-5f4f-8e50-699c35e52625` | Synthetic electrical report extract                     | PDF        | `deal-003-document-21.pdf` | 1     | `754efe6085a10c0e…` |
| `2025-003`        | `3fcaa3e3-3ac9-5f65-ad41-7fe96fdcbadf` | Inventory and room condition schedule                   | PDF        | `deal-003-document-9.pdf`  | 9     | `2ef2d3ca20507fa4…` |
| `2025-003`        | `427a20ed-127a-522e-af7e-8de29af2e478` | Synthetic energy assessment source summary              | PDF        | `deal-003-document-23.pdf` | 1     | `3dbfd57dfaa4a28b…` |
| `2025-003`        | `49b45463-5683-50df-8978-107d8fff1736` | Rent account statement                                  | DOCX → PDF | `deal-003-document-20.pdf` | 1     | `31255fc2c0d739ae…` |
| `2025-003`        | `4e21f346-48e7-51b8-b625-91bb9a75747a` | Tenancy variation instrument                            | PDF        | `deal-003-amendment-3.pdf` | 2     | `164981c76d53143c…` |
| `2025-003`        | `5550bbcb-ac16-50a3-bade-76bb58acfd27` | Synthetic gas safety record extract                     | PDF        | `deal-003-document-24.pdf` | 2     | `6c798edb3ef5527c…` |
| `2025-003`        | `68effbea-e16a-5f9d-ba91-75a5c693ed9a` | Deposit protection and information demonstration record | PDF        | `deal-003-document-8.pdf`  | 1     | `9a559a31ed5716cd…` |
| `2025-003`        | `6adf6e89-5d28-5c7e-bf86-c11d4fa315c1` | Approved letting particulars                            | PDF        | `deal-003-document-2.pdf`  | 1     | `aa184654e5565d8c…` |
| `2025-003`        | `7545e80f-a97b-5b3f-98b7-b27c2a9075ee` | Compliance and information delivery record              | PDF        | `deal-003-document-22.pdf` | 1     | `c12653e037ffc031…` |
| `2025-003`        | `7acadf8b-2887-58dc-a7d9-b7da063e69bd` | Repair scope and landlord authorisation                 | PDF        | `deal-003-document-17.pdf` | 2     | `09501dd8fbc39dff…` |
| `2025-003`        | `aea7bcbe-4914-523b-bf22-18ca4d245cab` | Management instruction amendment                        | PDF        | `deal-003-amendment-1.pdf` | 2     | `25bdb50f374fa07a…` |
| `2025-003`        | `b041160c-6804-5306-9f5a-a90135a361a7` | Check-in and alarm handover                             | PDF        | `deal-003-document-10.pdf` | 2     | `54f57a37fe1ef89c…` |
| `2025-003`        | `b467bd33-b567-545f-ad3d-b3d095aa34aa` | Tenancy variation instrument                            | PDF        | `deal-003-amendment-2.pdf` | 2     | `72b91de8eae0028c…` |
| `2025-003`        | `b5bb2911-785a-53cd-834e-d78a0dfcef7e` | Comparative check-out report                            | PDF        | `deal-003-document-12.pdf` | 6     | `b2dd2aa49308d5fc…` |
| `2025-003`        | `b792aaae-43b2-59ee-bdc3-f21430b5cf62` | Holding-deposit receipt and allocation                  | PDF        | `deal-003-document-4.pdf`  | 1     | `4c8d72be90bd8dd4…` |
| `2025-003`        | `c36cfb74-ead5-5434-bda3-0254fb927022` | Periodic inspection report                              | PDF        | `deal-003-document-16.pdf` | 2     | `369fabc0e8d0369f…` |
| `2025-003`        | `d396509a-4a6a-5c36-9fd1-48314d70305b` | Maintenance invoice and reconciliation                  | PDF        | `deal-003-document-19.pdf` | 2     | `e83b6c75c5f0738d…` |
| `2025-003`        | `d717483c-dca8-5b5b-9185-6db3d2e9f3ec` | Tenancy variation instrument                            | PDF        | `deal-003-amendment-4.pdf` | 2     | `47d030c9d0c2e82d…` |
| `2025-003`        | `e307c192-97cc-5006-8e48-b31b41b7ec4e` | Holding-deposit terms                                   | PDF        | `deal-003-document-3.pdf`  | 1     | `5cee1a69e951f8fc…` |
| `2025-013`        | `15fbd820-9aa9-560d-b325-a037c231f0c6` | Rent account statement                                  | PDF        | `deal-013-document-20.pdf` | 1     | `32ec5541bff4a36f…` |
| `2025-013`        | `172515df-d7be-5f90-a738-8ef771392e36` | Maintenance invoice and reconciliation                  | PDF        | `deal-013-document-19.pdf` | 2     | `5b1a77e073e57d14…` |
| `2025-013`        | `2247934b-9068-5c78-9884-7f8ef2cc2a9e` | Check-in and alarm handover                             | PDF        | `deal-013-document-10.pdf` | 1     | `46088fba76dfe3f2…` |
| `2025-013`        | `2fac0d97-7ca2-5e1a-bbac-b5e6a2e49b93` | Agreed tenancy-ending record                            | PDF        | `deal-013-document-11.pdf` | 2     | `055258d773d7cbd3…` |
| `2025-013`        | `36d7ae9a-5091-58b0-9444-07cbb6083361` | Historical-source receipt note                          | PDF        | `deal-013-document-26.pdf` | 2     | `23d6ba4cd971783d…` |
| `2025-013`        | `37033320-eb89-55d5-8b49-f7f2c76d6c8a` | Deposit settlement and refund ledger                    | PDF        | `deal-013-document-14.pdf` | 2     | `42dfcd947bde87ab…` |
| `2025-013`        | `39ca9600-da1f-5bd9-99a1-8d69ec18e002` | Deposit protection and information demonstration record | PDF        | `deal-013-document-8.pdf`  | 1     | `bae76511470b7efd…` |
| `2025-013`        | `3c256f37-4a9f-5eff-9c3b-8009d22b5c9a` | Matter closing and open-items summary                   | PDF        | `deal-013-document-15.pdf` | 1     | `747370078ff9787f…` |
| `2025-013`        | `44432b96-d638-5642-8852-2cdfa5c1d8bf` | Holding-deposit terms                                   | PDF        | `deal-013-document-3.pdf`  | 1     | `952a26d9e457395f…` |
| `2025-013`        | `45446c58-f142-5559-94c7-85af80e85e2e` | Comparative check-out report                            | PDF        | `deal-013-document-12.pdf` | 5     | `4efbd2fcffcce152…` |
| `2025-013`        | `4ce3b1d0-0e0a-5559-b792-e721b8766686` | Inventory and room condition schedule                   | PDF        | `deal-013-document-9.pdf`  | 8     | `23d47ff6a786f060…` |
| `2025-013`        | `5243157c-963b-5920-8183-fa0851daefff` | Residential tenancy agreement                           | PDF        | `deal-013-document-6.pdf`  | 4     | `d225962daacb720f…` |
| `2025-013`        | `581f1b00-a592-5b7e-8e59-f46b2e6e2f06` | Document delivery acknowledgement                       | PDF        | `deal-013-document-27.pdf` | 1     | `bf634f9793eddf4d…` |
| `2025-013`        | `62103023-5ee5-52de-ad72-c891585a0060` | Repair scope and landlord authorisation                 | DOCX → PDF | `deal-013-document-17.pdf` | 2     | `d90d4c68f0f1d9b9…` |
| `2025-013`        | `682f3889-e2df-56ae-ab3e-01a4c36e0fec` | Landlord property-management agreement                  | PDF        | `deal-013-document-1.pdf`  | 4     | `8da03db0cb710b8f…` |
| `2025-013`        | `7076ce55-5d13-5f40-9ed2-fb4eb0503826` | Synthetic electrical report extract                     | PDF        | `deal-013-document-21.pdf` | 1     | `8d21910ea9a61a8a…` |
| `2025-013`        | `7c1b46b6-6df5-55c9-add4-131c620d535e` | Synthetic referencing outcome                           | DOCX → PDF | `deal-013-document-5.pdf`  | 1     | `62c9f99d0ea77f3f…` |
| `2025-013`        | `809f450c-bfce-5266-9065-233248feb094` | Tenancy variation instrument                            | PDF        | `deal-013-amendment-3.pdf` | 2     | `4ef1a3918bb43842…` |
| `2025-013`        | `80a72db6-7ff5-5b7f-9cad-b672d938eb28` | Holding-deposit receipt and allocation                  | PDF        | `deal-013-document-4.pdf`  | 1     | `0257559a8a7749eb…` |
| `2025-013`        | `811de199-b3ac-546f-8585-311a4e6cea09` | Tenancy variation instrument                            | PDF        | `deal-013-amendment-4.pdf` | 2     | `e74003a5e4c64ccb…` |
| `2025-013`        | `9034aa05-c9fe-5497-85d6-245255c1e750` | Compliance and information delivery record              | PDF        | `deal-013-document-22.pdf` | 1     | `6279371ea006f393…` |
| `2025-013`        | `9077e341-8c33-5a88-a574-7a9f0c26391e` | Approved letting particulars                            | PDF        | `deal-013-document-2.pdf`  | 1     | `f39bfdaaad7cc3e0…` |
| `2025-013`        | `90f482d9-8482-52af-91e6-08ca27b95245` | Key custody change record                               | PDF        | `deal-013-document-25.pdf` | 2     | `6e5a4ad00d52facd…` |
| `2025-013`        | `9656cf23-14e2-5e89-bff6-83b67a5431fd` | Tenancy-deposit receipt                                 | DOCX → PDF | `deal-013-document-7.pdf`  | 2     | `1cc9fbe400514d89…` |
| `2025-013`        | `9b95cec7-383c-506e-9cc5-83d9814364b7` | Synthetic energy assessment source summary              | PDF        | `deal-013-document-23.pdf` | 1     | `79d9c258cadd87c2…` |
| `2025-013`        | `b4a33b84-9134-57b5-9265-c62568153bf9` | Fictional contractor findings and work report           | PDF        | `deal-013-document-18.pdf` | 2     | `b10e17e3921cbb50…` |
| `2025-013`        | `b552ad75-5980-563a-8440-1275e22fc167` | Deposit deduction proposal and response                 | PDF        | `deal-013-document-13.pdf` | 1     | `7136a51ee6b7badb…` |
| `2025-013`        | `c074763f-9689-55f9-b205-4874ba3d1e09` | Inventory discrepancy response                          | DOCX → PDF | `deal-013-document-24.pdf` | 1     | `56fda1b2c6756cb4…` |
| `2025-013`        | `cb5f86b9-3ad0-5894-92d5-9fa586c6235f` | Tenancy variation instrument                            | PDF        | `deal-013-amendment-2.pdf` | 2     | `b3c2c51f8aacc8d3…` |
| `2025-013`        | `dd5658e3-4b94-55dc-8765-d470a705ff51` | Management instruction amendment                        | PDF        | `deal-013-amendment-1.pdf` | 2     | `789d159fe7695552…` |
| `2025-013`        | `f2746d34-328e-5e1e-8470-8ed36af4b764` | Periodic inspection report                              | PDF        | `deal-013-document-16.pdf` | 2     | `0249a3d7aadb3004…` |
| seed (South team) | `60000000-0000-4000-8000-000000000003` | Purchase agreement                                      | PDF        | `contract-south.pdf`       | 1     | `9a9860a1583d7341…` |

## Known consequences

- The corpus validator (`apps/api/prisma/demo-archive/validate.ts`) compares
  each original with its canonical render. These 241 archive rows no longer
  match it. Their record hashes, the corpus digest and the release zip digests in
  `.omo/evidence/realistic-agency-archive` are historical and were not regenerated.
- The seed test uses the committed scan asset. The rest of the seed is unchanged.
