export interface Attendance {
  id: string;
  business_id: string;
  client_id: string;
  client_membership_id: string | null;
  attended_at: string;
}

// Attendance + nombres denormalizados para listar.
export interface AttendanceWithDetails extends Attendance {
  client_label: string; // "CI · Nombre"
  plan_name: string | null;
}
