export type WorkerStatus = "active" | "inactive";

export interface WorkerInput {
  full_name: string;
  phone: string | null;
  job_title: string | null;
  start_date: string;
  daily_wage: number;
  status: WorkerStatus;
  notes: string | null;
}

export interface WorkerRecord extends WorkerInput {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkerFilters {
  search?: string;
  status?: WorkerStatus | "all";
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function validateWorkerInput(input: WorkerInput): WorkerInput {
  const fullName = input.full_name.trim();
  if (fullName.length < 2 || fullName.length > 160) {
    throw new Error("اسم العامل يجب أن يتراوح بين حرفين و160 حرفاً.");
  }

  if (!Number.isFinite(input.daily_wage) || input.daily_wage < 0) {
    throw new Error("الأجر اليومي يجب أن يكون رقماً صحيحاً غير سالب.");
  }

  if (!isValidDate(input.start_date)) {
    throw new Error("تاريخ بداية العمل غير صالح.");
  }

  if (input.status !== "active" && input.status !== "inactive") {
    throw new Error("حالة العامل غير صالحة.");
  }

  const phone = normalizeOptionalText(input.phone);
  if (phone !== null && phone.length > 32) {
    throw new Error("رقم الهاتف طويل جداً.");
  }

  return {
    full_name: fullName,
    phone,
    job_title: normalizeOptionalText(input.job_title),
    start_date: input.start_date,
    daily_wage: roundMoney(input.daily_wage),
    status: input.status,
    notes: normalizeOptionalText(input.notes)
  };
}

export function filterWorkers<T extends WorkerRecord>(
  workers: readonly T[],
  filters: WorkerFilters = {}
): T[] {
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";
  const status = filters.status ?? "all";

  return workers
    .filter((worker) => worker.deleted_at === null)
    .filter((worker) => status === "all" || worker.status === status)
    .filter((worker) => {
      if (term.length === 0) return true;
      const searchable = [
        worker.full_name,
        worker.phone ?? "",
        worker.job_title ?? "",
        worker.notes ?? ""
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(term);
    })
    .sort((left, right) => {
      const nameOrder = left.full_name.localeCompare(right.full_name, "ar");
      return nameOrder !== 0 ? nameOrder : left.created_at.localeCompare(right.created_at);
    });
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
