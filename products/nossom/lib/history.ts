import type { Project } from './storage';
export function activeIndex(project: Project) {
  const index = project.versions.findIndex((v) => v.id === project.activeVersionId);
  return index < 0 ? project.versions.length - 1 : index;
}
export function previousIndex(project: Project, index: number) {
  if (index <= 0) return -1;
  const version = project.versions[index];
  return version.parentId
    ? project.versions.findIndex((v) => v.id === version.parentId)
    : index - 1;
}
export function nextIndex(project: Project, index: number) {
  const remembered = project.redoVersionIds?.[0];
  const rememberedIndex = project.versions.findIndex((v) => v.id === remembered);
  if (rememberedIndex >= 0 && previousIndex(project, rememberedIndex) === index)
    return rememberedIndex;
  const current = project.versions[index];
  for (let i = project.versions.length - 1; i > index; i--)
    if (project.versions[i].parentId === current.id) return i;
  return project.versions[index + 1] && !project.versions[index + 1].parentId ? index + 1 : -1;
}
export function activateVersion(project: Project, index: number): Project {
  if (!project.versions[index]) throw new Error('Esta versão não está disponível.');
  return {
    ...project,
    activeVersionId: project.versions[index].id,
    redoVersionIds: [],
    updatedAt: Date.now(),
  };
}
