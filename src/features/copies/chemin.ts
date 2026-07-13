export function cheminCopie(parentId: string, childId: string, homeworkId: string, id: string): string {
  return `${parentId}/${childId}/${homeworkId}/${id}.jpg`;
}
