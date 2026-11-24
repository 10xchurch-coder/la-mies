const go = (to: string) => { (window as unknown as { __nav: string[] }).__nav = [...((window as unknown as { __nav?: string[] }).__nav ?? []), to]; };
export const router = { push: go, replace: go, back: () => go('<atras>'), canGoBack: () => false };
export const useRouter = () => router;
export const useSegments = () => ['presentar'];
export const usePathname = () => location.pathname;
export const useFocusEffect = () => undefined;
export type Href = string;
