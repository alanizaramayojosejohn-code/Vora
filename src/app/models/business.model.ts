import { BusinessTheme } from '../services/theme/theme.presets';

export interface Business {
  id: string;
  name: string;
  theme: BusinessTheme;
  logo_url: string | null;
  created_at: string;
}
