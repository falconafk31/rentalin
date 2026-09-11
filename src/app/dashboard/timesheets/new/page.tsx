import { getWorkspaceData } from '@/lib/data';
import { ModuleWorkspace } from '@/components/module-workspace';
export default async function NewTimesheetPage(){return <ModuleWorkspace module="timesheets" data={await getWorkspaceData()} initialOpen/>;}
