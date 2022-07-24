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
        <div className="content-block">
          <h2>Generation parameters</h2>
          <div className="parameters-container">
            <div className="generation-parameter">
              <div>Generation:</div>
              <div id="generation-number">#1</div>
            </div>
            <div className="generation-parameter">
              <div>Generation size:</div>
              <div>100</div>
            </div>
            <div className="generation-parameter">
              <div>Group:</div>
              <div>1</div>
            </div>
            <div className="generation-parameter">
              <div>Group size</div>
              <div>2</div>
            </div>
            <div className="generation-parameter">
              <div>Generation lifetime:</div>
              <div>10 sec</div>
            </div>
          </div>
        </div>
        <div className="content-block">
          <h2>Algorithm parameters</h2>
          <div className="parameters-container">
            <div className="generation-parameter">
              <div>Mutation probability:</div>
              <div>4%</div>
            </div>
            <div className="generation-parameter">
              <div>Elitism rate:</div>
              <div>6%</div>
            </div>
            <div className="generation-parameter">
              <div>Time elapsed:</div>
              <div id="time-elapsed">0 sec</div>
            </div>
          </div>
        </div>
        <div className="mutation-selection-container">
          <div className="select-form-control">
            <h2>Mutation type</h2>
            <div className="select-container">
              <span id="mutation-select-value">First mutation</span>
              <div id="mutation-chevron-right">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={24}
                  height={24}
                  view-box="0 0 24 24"
                  fill="none"
                  stroke="#141414"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <div id="mutation-select-dropdown" className="select-dropdown">
                <div className="select-dropdown-item">First mutation</div>
                <div className="select-dropdown-item">Second mutation</div>
                <div className="select-dropdown-item">Third mutation</div>
              </div>
            </div>
          </div>
          <div className="select-form-control">
            <h2>Selection type</h2>
            <div className="select-container">
              <span id="mutation-select-value">First selection</span>
              <div id="mutation-chevron-right">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={24}
                  height={24}
                  view-box="0 0 24 24"
                  fill="none"
                  stroke="#141414"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <div id="mutation-select-dropdown" className="select-dropdown">
                <div className="select-dropdown-item">First selection</div>
                <div className="select-dropdown-item">Second selection</div>
                <div className="select-dropdown-item">Third selection</div>
              </div>
            </div>
          </div>
        </div>
        <div className="content-block">
          <h2>Best car from generation</h2>
          <div className="car-parameter-container">
            <h3>Car genome</h3>
            <code id="car-genome">1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1</code>
            <div className="footer">
              <div className="parameter">
                <div>NUMBER OF GENES:</div>
                <div>180</div>
              </div>
              <div className="parameter">
                <div>LOSS:</div>
                <div>0</div>
              </div>
              <div className="parameter">
                <div>FITNESS:</div>
                <div>0</div>
              </div>
            </div>
          </div>
          <div className="car-parameter-container">
            <h3>Engine formula coefficents</h3>
            <code id="engine-formula">22, -7.125, -148, 0.124, 0.063, 3.125, 0.021, 0.013, -5.875</code>
            <div className="footer">
              <div className="parameter">
                <div>
                  Coefficients for engine multivariate linear formula. Given in order x
                  <sub>8</sub>
                  , x
                  <sub>7</sub>
                  , ...
                  , x
                  <sub>0</sub>
                </div>
              </div>
            </div>
          </div>
          <div className="car-parameter-container">
            <h3>Wheel formula coefficents</h3>
            <code id="wheel-formula">22, -7.125, -148, 0.124, 0.063, 3.125, 0.021, 0.013, -5.875</code>
            <div className="footer">
              <div className="parameter">
                <div>
                  Coefficients for engine multivariate linear formula. Given in order x
                  <sub>8</sub>
                  , x
                  <sub>7</sub>
                  , ...
                  , x
                  <sub>0</sub>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
