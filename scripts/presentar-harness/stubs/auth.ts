const leader = !/[?&]miembro=1/.test(location.search);
// "Líder" acá = alguien a quien el pastor le dio el permiso del Modo presentación (sin ser pastor ni administrador).
export const useAuth = () => ({
  church: { id: 'c1', name: 'Iglesia de Prueba', logo_path: null }, isLeader: false, isStaff: false, session: { user: { id: 'u1' } },
  perms: leader ? ['presentar.usar'] : [], profile: { id: 'u1', role: 'member', extra_roles: [] },
  can: (p: string) => leader && p === 'presentar.usar',
});
