'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Modal({open,onOpenChange,title,description,children,wide=false}:{open:boolean;onOpenChange:(value:boolean)=>void;title:string;description?:string;children:ReactNode;wide?:boolean}) {
 return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="modal-overlay"/><DialogPrimitive.Content className={`modal-content ${wide?'modal-wide':''}`}><div className="modal-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description>{description||'Lengkapi informasi berikut untuk melanjutkan.'}</DialogPrimitive.Description></div><DialogPrimitive.Close className="icon-button" aria-label="Tutup"><X size={20}/></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
