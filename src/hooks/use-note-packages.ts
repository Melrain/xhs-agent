import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createNotePackage,
  deleteNotePackage,
  listNotePackages,
  PACKAGES_QUERY_KEY,
  updateNotePackage,
} from "@/lib/api/packages"

export function useNotePackages() {
  return useQuery({
    queryKey: PACKAGES_QUERY_KEY,
    queryFn: listNotePackages,
    staleTime: 10_000,
  })
}

export function useNotePackageMutations() {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY })

  return {
    create: useMutation({
      mutationFn: createNotePackage,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof updateNotePackage>[1]) =>
        updateNotePackage(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: deleteNotePackage,
      onSuccess: invalidate,
    }),
  }
}
