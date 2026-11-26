import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router"
import { Home } from "@/routes/Home"
import { PasswordGate } from "@/routes/Login"
import { PracticeCustom, PracticeRandom, PracticeTopic } from "@/routes/Practice"
import { Topics } from "@/routes/Topics"
import { PrefsProvider } from "@/state/prefs"

export default function App() {
  return (
    <PrefsProvider>
      <PasswordGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/type" element={<Navigate to="/practice/custom" replace />} />
            <Route path="/topics" element={<Topics group="situations" />} />
            <Route path="/pairs" element={<Topics group="pairs" />} />
            <Route path="/sounds" element={<Topics group="sounds" />} />
            <Route path="/topics/:topicId" element={<TopicRedirect />} />
            <Route path="/practice/topic/:topicId/:index" element={<PracticeTopic />} />
            <Route path="/practice/random" element={<PracticeRandom />} />
            <Route path="/practice/custom" element={<PracticeCustom />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </PasswordGate>
    </PrefsProvider>
  )
}

// Old phrase-list URLs go straight to practice at the first phrase.
function TopicRedirect() {
  const { topicId } = useParams()
  return <Navigate to={`/practice/topic/${topicId}/0`} replace />
}
