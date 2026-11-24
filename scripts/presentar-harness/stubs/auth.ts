const leader = !/[?&]miembro=1/.test(location.search);
export const useAuth = () => ({ church: { id: 'c1', name: 'Iglesia de Prueba', logo_path: null }, isLeader: leader, isStaff: leader, session: { user: { id: 'u1' } } });
