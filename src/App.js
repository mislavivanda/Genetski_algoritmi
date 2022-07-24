import EvolutionTabEvolution from './components/evolution/EvolutionTabEvolution'
import './style.css'

function App() {
  return (
    <div>
      <div className="main-container">
        <h1>Self parking car with genetic algorithms evolution</h1>
        <div className="car-simulator-container">
          <EvolutionTabEvolution />
        </div>
      </div>
    </div>
  )
}

export default App
