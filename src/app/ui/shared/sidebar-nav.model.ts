import { PlanFeature } from '../../models/subscription.model';

export type SidebarIconName =
  | 'home' | 'users' | 'box' | 'folder' | 'table' | 'user-cog'
  | 'package' | 'cart' | 'clock' | 'bar-chart' | 'building' | 'credit-card';

export interface SidebarNavItem {
  route: string;
  label: string;
  icon: SidebarIconName;
  exact?: boolean;
}

export interface SidebarNavGroup {
  label: string;
  items: SidebarNavItem[];
  // Si está presente, el grupo entero (encabezado + items) se oculta cuando
  // el plan del negocio no incluye esta feature — mismo criterio que
  // IfPlanDirective, pero acá no se puede usar esa directiva porque exige un
  // PlanFeature obligatorio y la mitad de los grupos no tienen ninguno.
  planFeature?: PlanFeature;
}
