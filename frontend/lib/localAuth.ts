// * localAuth.ts — Local DB Authentication & Storage Service
// * Implements admin authentication logic
// ! Create account disabled for now with TODO comment

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  defaultCity: string;
  aqiThreshold: number;
}

const STORAGE_KEY_CURRENT_USER = "aetheris_admin_session";

// TODO: Re-enable self-service registration when Auth0 / multi-tenant database is provisioned
export async function localRegister(
  _email: string,
  _username: string,
  _displayName: string,
  _password: string
): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  // TODO: Registration temporarily disabled by administrator
  return {
    success: false,
    error: "Account creation is currently disabled. Please sign in using admin credentials.",
  };
}

export async function localLogin(
  usernameOrEmail: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  const norm = usernameOrEmail.toLowerCase().trim();

  // * Hardcoded admin credentials for current stage
  if ((norm === "admin" || norm === "admin@aetheris.ai") && password === "admin") {
    const adminUser: UserProfile = {
      id: "usr_admin_01",
      email: "admin@aetheris.ai",
      username: "admin",
      displayName: "admin",
      role: "System Administrator & Fleet Commander",
      createdAt: new Date().toISOString(),
      defaultCity: "Detected Location",
      aqiThreshold: 100,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(adminUser));
    }
    return { success: true, user: adminUser };
  }

  return { success: false, error: "Invalid credentials. Please use admin / admin." };
}

export function getLocalSession(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
  if (!raw) {
    const defaultAdmin: UserProfile = {
      id: "usr_admin_01",
      email: "admin@aetheris.ai",
      username: "admin",
      displayName: "admin",
      role: "System Administrator",
      createdAt: new Date().toISOString(),
      defaultCity: "Detected Location",
      aqiThreshold: 100,
    };
    return defaultAdmin;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function localLogout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  }
}
