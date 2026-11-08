import { supabase } from "../stores/auth.store";
import { localDb, setArchiveStoragePath } from "@taher/db";
const BUCKET="company-archives";
function safeFileName(name:string):string {
 const cleaned=name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-100);
 return cleaned || "document";
}
export async function uploadArchiveFile(companyId:string,archiveId:string,file:Blob,fileName:string):Promise<string|null>{
 if(!supabase||!navigator.onLine)return null;
 const path=companyId+"/"+archiveId+"/"+safeFileName(fileName);
 const {error}=await supabase.storage.from(BUCKET).upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
 if(error)throw new Error("تعذر رفع الملف إلى التخزين السحابي: "+error.message);
 await setArchiveStoragePath(companyId,archiveId,path);
 return path;
}
export async function getArchiveDownloadUrl(path:string):Promise<string|null>{
 if(!supabase||!navigator.onLine)return null;
 const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,60);
 if(error)throw new Error("تعذر فتح الملف المؤرشف: "+error.message);
 return data.signedUrl;
}

export async function syncPendingArchiveFiles(companyId:string):Promise<number>{
 if(!companyId.trim()||!supabase||!navigator.onLine)return 0;
 const pending=await localDb.archives.where("company_id").equals(companyId)
  .and(row=>row.deleted_at===null&&row.file_blob!==null&&!row.storage_path)
  .toArray();
 let uploaded=0;
 for(const row of pending){
  if(!row.file_blob)continue;
  await uploadArchiveFile(companyId,row.id,row.file_blob,row.original_file_name??"document");
  uploaded+=1;
 }
 return uploaded;
}
