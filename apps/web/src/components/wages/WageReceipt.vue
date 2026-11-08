<script setup lang="ts">
import type { LocalWage, LocalWagePayment } from "@taher/db";

defineProps<{
  wage: LocalWage;
  payment: LocalWagePayment;
  workerName: string;
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
  <article class="wage-receipt-print" dir="rtl">
    <header class="wage-receipt-header">
      <div class="wage-receipt-brand">TAHER ACCOUNTING NG</div>
      <h1>{{ companyName }}</h1>
      <p>وصل دفع أجرة عامل</p>
    </header>

    <div class="wage-receipt-number">
      <span>رقم الوصل</span>
      <strong>{{ payment.receipt_number }}</strong>
    </div>

    <div class="wage-receipt-meta">
      <div><span>العامل</span><strong>{{ workerName }}</strong></div>
      <div><span>فترة الأجر</span><strong>{{ wage.wage_month.slice(0, 7) }}</strong></div>
      <div><span>تاريخ الدفع</span><strong>{{ payment.payment_date }}</strong></div>
      <div><span>طريقة الدفع</span><strong>{{ payment.payment_method === "cash" ? "نقداً" : "تحويل بنكي" }}</strong></div>
    </div>

    <h2>تفاصيل احتساب الأجر</h2>
    <table class="wage-receipt-table">
      <tbody>
        <tr><th>أيام العمل</th><td>{{ wage.work_days }}</td></tr>
        <tr><th>الأجر اليومي</th><td>{{ money(wage.daily_rate, currencyCode) }}</td></tr>
        <tr><th>الأجر الأساسي</th><td>{{ money(wage.base_amount, currencyCode) }}</td></tr>
        <tr><th>الساعات الإضافية</th><td>{{ wage.overtime_hours }}</td></tr>
        <tr><th>مبلغ العمل الإضافي</th><td>{{ money(wage.overtime_amount, currencyCode) }}</td></tr>
        <tr><th>المكافآت</th><td>{{ money(wage.bonuses, currencyCode) }}</td></tr>
        <tr><th>الرصيد المرحّل</th><td>{{ money(wage.carried_balance, currencyCode) }}</td></tr>
        <tr><th>الاقتطاعات</th><td>− {{ money(wage.deductions, currencyCode) }}</td></tr>
        <tr><th>التسبيقات المخصومة</th><td>− {{ money(wage.advances_deducted, currencyCode) }}</td></tr>
        <tr class="wage-receipt-total"><th>صافي المستحق</th><td>{{ money(wage.net_due, currencyCode) }}</td></tr>
      </tbody>
    </table>

    <div class="wage-receipt-paid">
      <span>الدفعة الحالية</span>
      <strong>{{ money(payment.amount, currencyCode) }}</strong>
    </div>

    <div class="wage-receipt-balance">
      <span>المتبقي بعد هذه الدفعة</span>
      <strong>{{ money(wage.net_due - wage.paid_amount, currencyCode) }}</strong>
    </div>

    <p v-if="payment.notes" class="wage-receipt-notes">ملاحظات: {{ payment.notes }}</p>

    <footer class="wage-receipt-signatures">
      <div><span>إمضاء العامل</span><i></i></div>
      <div><span>إمضاء المسؤول</span><i></i></div>
    </footer>
    <p class="wage-receipt-footer">حرّر هذا الوصل بواسطة Taher Accounting NG</p>
  </article>
</template>

<style>
.wage-receipt-print {
  display: none;
  color: #111827;
  background: #fff;
  font-family: Tahoma, Arial, sans-serif;
}

.wage-receipt-header {
  padding-bottom: 4mm;
  border-bottom: 1px solid #94a3b8;
  text-align: center;
}
.wage-receipt-brand {
  color: #1d4ed8;
  font-size: 9pt;
  font-weight: 800;
  direction: ltr;
}
.wage-receipt-header h1 {
  margin: 2mm 0;
  font-size: 16pt;
  font-weight: 800;
}
.wage-receipt-header p {
  margin: 0;
  color: #475569;
  font-size: 10pt;
}
.wage-receipt-number {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  margin: 4mm 0;
  padding: 3mm;
  border: 1px solid #cbd5e1;
  border-radius: 2mm;
  font-size: 9pt;
}
.wage-receipt-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3mm 5mm;
  margin: 4mm 0;
}
.wage-receipt-meta div {
  display: flex;
  flex-direction: column;
  gap: 1mm;
  padding: 2mm;
  background: #f8fafc;
  border-radius: 1mm;
  font-size: 8.5pt;
}
.wage-receipt-meta span {
  color: #64748b;
}
.wage-receipt-print h2 {
  margin: 4mm 0 2mm;
  font-size: 10pt;
  font-weight: 800;
}
.wage-receipt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.wage-receipt-table th,
.wage-receipt-table td {
  padding: 2mm 3mm;
  border-bottom: 1px solid #e2e8f0;
}
.wage-receipt-table th {
  width: 58%;
  text-align: right;
  font-weight: 500;
  color: #475569;
}
.wage-receipt-table td {
  text-align: left;
  font-weight: 700;
}
.wage-receipt-total th,
.wage-receipt-total td {
  border-top: 1px solid #64748b;
  color: #111827;
  font-weight: 800;
}
.wage-receipt-paid,
.wage-receipt-balance {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  margin-top: 3mm;
  padding: 3mm;
  border: 1px solid #334155;
  border-radius: 2mm;
  font-size: 10pt;
  font-weight: 800;
}
.wage-receipt-balance {
  border-style: dashed;
}
.wage-receipt-notes {
  margin-top: 3mm;
  font-size: 8.5pt;
}
.wage-receipt-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12mm;
  margin-top: 10mm;
  text-align: center;
  font-size: 9pt;
}
.wage-receipt-signatures i {
  display: block;
  height: 13mm;
  margin-top: 2mm;
  border-bottom: 1px dotted #64748b;
}
.wage-receipt-footer {
  margin-top: 5mm;
  text-align: center;
  color: #64748b;
  font-size: 8pt;
}

@media print {
  @page {
    size: A5 portrait;
    margin: 8mm;
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
  .wage-receipt-print,
  .wage-receipt-print * {
    visibility: visible !important;
  }
  .wage-receipt-print {
    display: block !important;
    position: absolute;
    inset: 0;
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 0;
    color: #111827 !important;
    background: #fff !important;
  }
}
</style>
