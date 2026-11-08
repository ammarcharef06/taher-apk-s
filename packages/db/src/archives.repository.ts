import { filterArchives, validateArchiveInput, type ArchiveFilters, type ArchiveInput } from "@taher/core";
import { localDb, type LocalArchive, type SyncQueueItem } from "./local.db";
const now=()=>new Date().toISOString(); const id=()=>globalThis.crypto.randomUUID();
function queue(companyId:string,recordId:string,operation:SyncQueueItem["operation"],payload:unknown,timestamp:string):SyncQueueItem{return{company_id:companyId,entity:"archives",record_id:recordId,operation,payload,status:"pending",retry_count:0,last_error:null,created_at:timestamp,updated_at:timestamp};}
export async function listArchives(companyId:string,filters:ArchiveFilters={}):Promise<LocalArchive[]>{
 if(!companyId.trim())throw new Error("معرّف الشركة مطلوب.");
 const rows=await localDb.archives.where("company_id").equals(companyId).and(r=>r.deleted_at===null&&r._deleted===null).toArray();
 return filterArchives(rows as never,filters) as LocalArchive[];
}
export async function saveArchive(companyId:string,input:ArchiveInput,userId:string|null,archiveId?:string):Promise<LocalArchive>{
 if(!companyId.trim())throw new Error("معرّف الشركة مطلوب.");const data=validateArchiveInput(input);const timestamp=now();
 return localDb.transaction("rw",[localDb.archives,localDb.syncQueue],async()=>{
  const previous=archiveId?await localDb.archives.get(archiveId):undefined;
  if(archiveId&&(!previous||previous.company_id!==companyId||previous.deleted_at!==null))throw new Error("وثيقة الأرشيف غير موجودة.");
  if(data.source_table&&data.source_id){
   const duplicate=await localDb.archives.where("[company_id+source_id]").equals([companyId,data.source_id]).first();
   if(duplicate&&duplicate.id!==archiveId)throw new Error("توجد وثيقة أرشيف مرتبطة بهذا السجل بالفعل.");
  }
  const record:LocalArchive={...(previous??{} as LocalArchive),...data,id:previous?.id??id(),company_id:companyId,storage_path:previous?.storage_path??null,file_blob:previous?.file_blob??null,original_file_name:previous?.original_file_name??null,mime_type:previous?.mime_type??null,file_size:previous?.file_size??null,created_at:previous?.created_at??timestamp,updated_at:timestamp,deleted_at:null,_synced:0,_updated_at:timestamp,_deleted:null};
  await localDb.archives.put(record);await localDb.syncQueue.add(queue(companyId,record.id,previous?"update":"insert",{...record,file_blob:null},timestamp));return record;
 });
}
export async function saveArchiveFileLocal(companyId:string,archiveId:string,file:Blob,fileName:string):Promise<LocalArchive>{
 const timestamp=now();
 if(file.size===0)throw new Error("الملف فارغ.");
 if(file.size>15*1024*1024)throw new Error("الحد الأقصى لحجم الملف 15 ميغابايت.");
 const allowed=["application/pdf","image/jpeg","image/png","image/webp"];
 if(!allowed.includes(file.type))throw new Error("نوع الملف غير مدعوم. استخدم PDF أو JPG أو PNG أو WEBP.");
 return localDb.transaction("rw",[localDb.archives,localDb.syncQueue],async()=>{
  const row=await localDb.archives.get(archiveId);
  if(!row||row.company_id!==companyId||row.deleted_at!==null)throw new Error("وثيقة الأرشيف غير موجودة.");
  const updated:LocalArchive={...row,file_blob:file,original_file_name:fileName.trim().slice(0,255),mime_type:file.type,file_size:file.size,updated_at:timestamp,_updated_at:timestamp,_synced:0};
  await localDb.archives.put(updated);
  await localDb.syncQueue.add(queue(companyId,archiveId,"update",{...updated,file_blob:null},timestamp));
  return updated;
 });
}
export async function setArchiveStoragePath(companyId:string,archiveId:string,path:string):Promise<void>{
 const timestamp=now();
 await localDb.transaction("rw",[localDb.archives,localDb.syncQueue],async()=>{
  const row=await localDb.archives.get(archiveId);if(!row||row.company_id!==companyId)throw new Error("وثيقة الأرشيف غير موجودة.");
  const updated={...row,storage_path:path,updated_at:timestamp,_updated_at:timestamp,_synced:0};
  await localDb.archives.put(updated);await localDb.syncQueue.add(queue(companyId,archiveId,"update",{...updated,file_blob:null},timestamp));
 });
}
export async function setArchiveDelivered(companyId:string,archiveId:string,delivered:boolean):Promise<void>{
 const timestamp=now();await localDb.transaction("rw",[localDb.archives,localDb.syncQueue],async()=>{
 const row=await localDb.archives.get(archiveId);if(!row||row.company_id!==companyId||row.deleted_at!==null)throw new Error("وثيقة الأرشيف غير موجودة.");
 const updated={...row,delivered_to_accountant:delivered,delivered_at:delivered?timestamp:null,updated_at:timestamp,_updated_at:timestamp,_synced:0};
 await localDb.archives.put(updated);await localDb.syncQueue.add(queue(companyId,archiveId,"update",{...updated,file_blob:null},timestamp));
 });
}
export async function deleteArchive(companyId:string,archiveId:string):Promise<void>{
 const timestamp=now();await localDb.transaction("rw",[localDb.archives,localDb.syncQueue],async()=>{
 const row=await localDb.archives.get(archiveId);if(!row||row.company_id!==companyId||row.deleted_at!==null)throw new Error("وثيقة الأرشيف غير موجودة.");
 const updated={...row,deleted_at:timestamp,updated_at:timestamp,_updated_at:timestamp,_deleted:timestamp,_synced:0};
 await localDb.archives.put(updated);await localDb.syncQueue.add(queue(companyId,archiveId,"update",{...updated,file_blob:null},timestamp));
 });
}
