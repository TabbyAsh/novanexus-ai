import { redirect } from 'next/navigation';

// Canonical human entrypoint. The existing dashboard path remains the runtime
// location so bookmarks and auth flows keep working during the naming migration.
export default function NexusEntrypoint() {
  redirect('/dashboard/nova');
}
