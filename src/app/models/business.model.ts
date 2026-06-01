import { BusinessTheme } from '../services/theme/theme.presets';

export interface BusinessOwner {
  first_name:        string;
  last_name:         string;
  phone:             string;
  sex:               'masculino' | 'femenino' | '';
  city:              string;
  business_location: string;
}

export interface Business {
  id: string;
  name: string;
  theme: BusinessTheme;
  logo_url: string | null;
  owner: BusinessOwner | null;
  created_at: string;
}
