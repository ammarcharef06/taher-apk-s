<script setup lang="ts">
import type { CashTransactionRecord } from "@taher/core";

defineProps<{
  transaction: CashTransactionRecord;
  companyName: string;
  currencyCode: string;
}>();

function money(value: number, currencyCode: string): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(value);
}
</script>

<template>
  <article class="cash-receipt-print" dir="rtl">
    <header class="receipt-header">
      <div class="receipt-brand">Taher Accounting NG</div>
      <h1>{{ companyName }}</h1>
      <p>وصل حركة صندوق</p>
    </header>

    <div class="receipt-number">
      <span>رقم الوصل</span>
      <strong>{{ transaction.document_number || transaction.id.slice(0, 8).toUpperCase() }}</strong>
    </div>

    <dl class="receipt-details">
      <div>
        <dt>التاريخ</dt>
        <dd>{{ transaction.transaction_date }}</dd>
      </div>
      <div>
        <dt>نوع الحركة</dt>
        <dd>{{ transaction.transaction_type === "income" ? "مقبوضات" : "مدفوعات" }}</dd>
      </div>
      <div>
        <dt>المستفيد / الجهة</dt>
        <dd>{{ transaction.beneficiary || "—" }}</dd>
      </div>
      <div>
        <dt>البيان</dt>
        <dd>{{ transaction.description }}</dd>
      </div>
      <div v-if="transaction.notes">
        <dt>ملاحظات</dt>
        <dd>{{ transaction.notes }}</dd>
      </div>
    </dl>

    <div class="receipt-amount">
      <span>المبلغ {{ transaction.transaction_type === "income" ? "المقبوض" : "المدفوع" }}</span>
      <strong>{{ money(transaction.amount, currencyCode) }}</strong>
    </div>

    <footer class="receipt-signatures">
      <div><span>إمضاء المستلم</span><i></i></div>
      <div><span>إمضاء المسؤول</span><i></i></div>
    </footer>

    <p class="receipt-footer">حُرّر هذا الوصل بواسطة Taher Accounting NG</p>
  </article>
</template>

<style>
.cash-receipt-print {
  display: none;
  color: #111827;
  background: #fff;
  font-family: Tahoma, Arial, sans-serif;
}

.receipt-header {
  padding-bottom: 5mm;
  text-align: center;
  border-bottom: 1px solid #94a3b8;
}

.receipt-brand {
  color: #1d4ed8;
  font-size: 10pt;
  font-weight: 700;
  direction: ltr;
}

.receipt-header h1 {
  margin: 2mm 0;
  font-size: 17pt;
  font-weight: 800;
}

.receipt-header p {
  margin: 0;
  color: #475569;
  font-size: 10pt;
}

.receipt-number {
  display: flex;
  justify-content: space-between;
  gap: 5mm;
  margin: 5mm 0;
  padding: 3mm;
  border: 1px solid #cbd5e1;
  border-radius: 2mm;
  font-size: 10pt;
}

.receipt-details {
  margin: 0;
  border-top: 1px solid #e2e8f0;
}

.receipt-details div {
  display: grid;
  grid-template-columns: 38mm 1fr;
  gap: 4mm;
  padding: 3mm 1mm;
  border-bottom: 1px solid #e2e8f0;
  font-size: 10pt;
  break-inside: avoid;
}

.receipt-details dt {
  color: #475569;
}

.receipt-details dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.receipt-amount {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5mm;
  margin-top: 6mm;
  padding: 5mm;
  border: 2px solid #334155;
  border-radius: 2mm;
}

.receipt-amount span {
  font-size: 11pt;
  font-weight: 700;
}

.receipt-amount strong {
  font-size: 17pt;
  font-weight: 800;
}

.receipt-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12mm;
  margin-top: 14mm;
  text-align: center;
  font-size: 9pt;
}

.receipt-signatures i {
  display: block;
  height: 16mm;
  margin-top: 2mm;
  border-bottom: 1px dotted #64748b;
}

.receipt-footer {
  margin-top: 8mm;
  text-align: center;
  color: #64748b;
  font-size: 8pt;
}

@media print {
  @page {
    size: A5 portrait;
    margin: 9mm;
  }

  html,
  body {
    width: 100%;
    min-height: auto;
    margin: 0 !important;
    background: #fff !important;
  }

  body * {
    visibility: hidden !important;
  }

  .cash-receipt-print,
  .cash-receipt-print * {
    visibility: visible !important;
  }

  .cash-receipt-print {
    display: block !important;
    position: absolute;
    inset: 0;
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 0;
    background: #fff !important;
    color: #111827 !important;
  }
}
</style>
