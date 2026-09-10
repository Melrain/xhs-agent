import { useEffect, useRef, useState } from "react"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { useCloudAuth } from "@/lib/auth/use-cloud-auth"
import { CHARACTERS_QUERY_KEY, LOOKS_QUERY_KEY } from "@/lib/api/characters"
import { RECRUIT_ASSETS_QUERY_KEY } from "@/lib/api/recruit"
import { VANITY_USER_REFS_KEY } from "@/hooks/use-vanity-refs"
import { getAccessToken, subscribeAuthStorage } from "@/lib/auth/tokens"
import { resetPresignedUrlCache } from "@/lib/media-url"
import { ExecutorSourceSwitch } from "@/components/ExecutorSourceSwitch"
import { ImageProviderSwitch } from "@/components/ImageProviderSwitch"
import { useExecutorSource } from "@/hooks/use-executor-source"
import { useUserEvents } from "@/hooks/use-user-events"
import { useLiveEventsWanted } from "@/lib/live-events-gate"
import { CloudGate } from "./shell/CloudGate"
import { Sidebar } from "./shell/Sidebar"
import { UpdateBar } from "./shell/UpdateBar"
import { WORKSPACES, type WorkspaceId } from "./shell/types"
import { CommentsWorkspace } from "./workspaces/CommentsWorkspace"
import { FilmWorkspace } from "./workspaces/FilmWorkspace"
import { MakeupWorkspace } from "./workspaces/MakeupWorkspace"
import { NotesWorkspace } from "./workspaces/NotesWorkspace"
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
  const previousToken = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (previousId.current !== undefined && previousId.current !== userId) {
      client.clear()
      resetPresignedUrlCache()
    }
    previousId.current = userId
  }, [client, userId])

  useEffect(() => {
    previousToken.current = getAccessToken()
    return subscribeAuthStorage(() => {
      const token = getAccessToken()
      if (previousToken.current === token) return
      previousToken.current = token
      resetPresignedUrlCache()
      void client.invalidateQueries({ queryKey: CHARACTERS_QUERY_KEY })
      void client.invalidateQueries({ queryKey: LOOKS_QUERY_KEY })
      void client.invalidateQueries({ queryKey: RECRUIT_ASSETS_QUERY_KEY })
      void client.invalidateQueries({ queryKey: VANITY_USER_REFS_KEY })
    })
  }, [client])
}

function AppShell() {
  const [workspace, setWorkspace] = useState<WorkspaceId>("recruit")
  const [commentsMounted, setCommentsMounted] = useState(false)
  const [executorSource, setExecutorSource] = useExecutorSource()
  const cloud = useCloudAuth()
  useResetQueriesOnUserChange(cloud.user?.id ?? null)
  const liveEventsWanted = useLiveEventsWanted()
  useUserEvents({ enabled: Boolean(cloud.signedIn) && liveEventsWanted })
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
            <div className="topbar-switches">
              <ImageProviderSwitch className="topbar-image-provider" />
              <ExecutorSourceSwitch
                className="topbar-executor-source"
                value={executorSource}
                platform="desktop"
                onChange={setExecutorSource}
              />
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
                <div className="app-pane" hidden={workspace !== "notes"}>
                  <NotesWorkspace
                    active={workspace === "notes"}
                    onNeedLogin={() => setWorkspace("comments")}
                  />
                </div>
                <div className="app-pane" hidden={workspace !== "makeup"}>
                  <MakeupWorkspace />
                </div>
                <div className="app-pane" hidden={workspace !== "film"}>
                  <FilmWorkspace />
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
