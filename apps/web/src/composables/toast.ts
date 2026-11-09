import { ref } from "vue";
export type ToastKind = "success" | "error" | "info";
export interface ToastMessage { id:number; kind:ToastKind; title:string; message:string; }
const messages=ref<ToastMessage[]>([]);
let sequence=0;
const timers=new Map<number,ReturnType<typeof setTimeout>>();
function dismiss(id:number){const timer=timers.get(id);if(timer)clearTimeout(timer);timers.delete(id);messages.value=messages.value.filter(x=>x.id!==id);}
function push(kind:ToastKind,message:string){const id=++sequence;messages.value=[...messages.value,{id,kind,title:kind==="success"?"تم بنجاح":kind==="error"?"حدث خطأ":"تنبيه",message}];timers.set(id,setTimeout(()=>dismiss(id),4800));}
export function useToast(){return{messages,success:(m:string)=>push("success",m),error:(m:string)=>push("error",m),info:(m:string)=>push("info",m),dismiss};}
