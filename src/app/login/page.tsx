import { isPreview } from '@/lib/auth';
import { LoginForm } from '@/components/login-form';
export const dynamic='force-dynamic';
export default function LoginPage(){return <LoginForm preview={isPreview()}/>;}
