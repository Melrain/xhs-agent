import { useEffect, useRef, useState } from "react"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { useCloudAuth } from "@/lib/auth/use-cloud-auth"
import { resetPresignedUrlCache } from "@/lib/media-url"
import { CloudGate } from "./shell/CloudGate"
import { Sidebar } from "./shell/Sidebar"
import { UpdateBar } from "./shell/UpdateBar"
import { WORKSPACES, type WorkspaceId } from "./shell/types"
import { CommentsWorkspace } from "./workspaces/CommentsWorkspace"
import { MakeupWorkspace } from "./workspaces/MakeupWorkspace"
import { RecruitWorkspace } from "./workspaces/RecruitWorkspace"
import "./styles.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function useResetQueriesOnUserChange(userId: string | null) {
  const client = useQueryClient()
  const previousId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (previousId.current !== undefined && previousId.current !== userId) {
      client.clear()
      resetPresignedUrlCache()
    }
    previousId.current = userId
  }, [client, userId])
}

function AppShell() {
  const [workspace, setWorkspace] = useState<WorkspaceId>("recruit")
  const [commentsMounted, setCommentsMounted] = useState(false)
  const cloud = useCloudAuth()
  useResetQueriesOnUserChange(cloud.user?.id ?? null)
  const meta = WORKSPACES.find((item) => item.id === workspace)

  useEffect(() => {
    if (workspace === "comments") setCommentsMounted(true)
  }, [workspace])

  return (
    <div className="app-shell">
      <Sidebar workspace={workspace} onChange={setWorkspace} user={cloud.user} />
      <div className="app-main">
        <div>
          <UpdateBar />
          <header className="topbar">
            <div>
              <h2>{meta?.label}</h2>
              <p>{meta?.hint}</p>
            </div>
          </header>
        </div>
        <div className="app-stage">
          {commentsMounted ? (
            <div className="app-pane" hidden={workspace !== "comments"}>
              <CommentsWorkspace />
            </div>
          ) : null}
          <div className="app-pane" hidden={workspace === "comments"}>
            <CloudGate ready={cloud.ready} signedIn={cloud.signedIn}>
              <div className="app-pane-stack">
                <div className="app-pane" hidden={workspace !== "recruit"}>
                  <RecruitWorkspace />
                </div>
                <div className="app-pane" hidden={workspace !== "makeup"}>
                  <MakeupWorkspace />
                </div>
              </div>
            </CloudGate>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
