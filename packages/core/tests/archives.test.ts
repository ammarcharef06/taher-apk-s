import { describe, expect, it } from "vitest";
import { filterArchives, validateArchiveInput, type ArchiveRecord } from "../src/archives";
const input = { source_table:null,source_id:null,document_type:"فاتورة",counterparty:"مورد",invoice_number:"A-1",document_date:"2026-11-08",amount:100,cabinet:"A",shelf:"2",delivered_to_accountant:false,delivered_at:null,notes:null };
describe("archives", () => {
  it("validates archive metadata", () => expect(validateArchiveInput(input).document_type).toBe("فاتورة"));
  it("rejects invalid date and amount", () => {
    expect(() => validateArchiveInput({...input,document_date:"bad"})).toThrow();
    expect(() => validateArchiveInput({...input,amount:-1})).toThrow();
  });
  it("filters by delivery state", () => {
    const rows = [{...input,id:"1",company_id:"c",storage_path:null,created_at:"2026-11-08",updated_at:"2026-11-08",deleted_at:null}] as ArchiveRecord[];
    expect(filterArchives(rows,{delivered:"no"})).toHaveLength(1);
  });
});
