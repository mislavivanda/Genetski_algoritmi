import { useEffect, useRef, useState, useCallback } from 'react'
import _ from 'lodash'
import { Block } from 'baseui/block'
import { useSnackbar, DURATION } from 'baseui/snackbar'
import { BiUpload } from 'react-icons/all'

import { createGeneration, Generation, Genome, Percentage, Probability, select } from '../../libs/genetic'
import { CarsLossType } from './PopulationTable'
import { CarLicencePlateType, CarsType, CarType } from '../world/types/car'
import { carLossToFitness, GENOME_LENGTH, decodeGenome } from '../../libs/carGenetic'
import {
  generateWorldVersion,
  generationToCars,
  loadGenerationFromStorage,
  saveGenerationToStorage,
  formatLossValue,
  formatCoefficient
} from './utils/evolution'
import { getBooleanSearchParam, getFloatSearchParam, getIntSearchParam } from '../../utils/url'
import { loggerBuilder } from '../../utils/logger'
import ParkingAutomatic from '../world/parkings/ParkingAutomatic'
import World from '../world/World'
import Timer from './Timer'
import {
  BAD_SIMULATION_BATCH_INDEX_CHECK,
  BAD_SIMULATION_MIN_LOSS_INCREASE_PERCENTAGE,
  BAD_SIMULATION_RETRIES_ENABLED,
  BAD_SIMULATION_RETRIES_NUM,
  FITNESS_ALPHA,
} from './constants/evolution'
import { DynamicCarsPosition } from '../world/constants/cars'
import { DYNAMIC_CARS_POSITION_FRONT } from '../world/constants/cars'
//EVOLUTION PARAMS
const DEFAULT_PERFORMANCE_BOOST: boolean = false
const DEFAULT_GENERATION_SIZE: number = 100
const DEFAULT_BATCH_SIZE: number = 2
const DEFAULT_MUTATION_PROBABILITY: Probability = 0.04
const DEFAULT_LONG_LIVING_CHAMPIONS_PERCENTAGE: Percentage = 6
const DEFAULT_GENERATION_LIFETIME: number = 17
const SECOND: number = 1000

const GENERATION_SIZE_URL_PARAM = 'generation'
const GROUP_SIZE_URL_PARAM = 'group'
const GENERATION_LIFETIME_URL_PARAM = 'lifetime'
const MUTATION_PROBABILITY_URL_PARAM = 'mutation'
const LONG_LIVING_CHAMPIONS_URL_PARAM = 'champions'
const PERFORMANCE_BOOST_URL_PARAM = 'boost'

//  Genome array, concatenated to a string (i.e. '1010011')
type GenomeKey = string

type GenomeLossType = Record<GenomeKey, number | null>

function EvolutionTabEvolution() {
  const { enqueue } = useSnackbar()

  //CUSTOM STATE
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [updateScene, setUpdateScene] = useState<boolean>(true)
  const [mutationType, setMutationType] = useState<string>('First mutation')
  const [selectionType, setSelectionType] = useState<string>('First selection')
  const [mutationDropdownOpen, setMutationDropdownOpen] = useState<boolean>(false)
  const [selectionDropdownOpen, setSelectionDropdownOpen] = useState<boolean>(false)
  //CUSTOM REFS
  const mutationTypeChevronRef = useRef<HTMLDivElement | null>(null)
  const selectionTypeChevronRef = useRef<HTMLDivElement | null>(null)

  const [performanceBoost, setPerformanceBoost] = useState<boolean>(
    getBooleanSearchParam(PERFORMANCE_BOOST_URL_PARAM, DEFAULT_PERFORMANCE_BOOST)
  )

  const [worldIndex, setWorldIndex] = useState<number>(0)

  const [generationSize, setGenerationSize] = useState<number>(
    getIntSearchParam(GENERATION_SIZE_URL_PARAM, DEFAULT_GENERATION_SIZE)
  )
  const [restoredFromGenerationIndex, setRestoredFromGenerationIndex] = useState<number | null>(null)
  const [generationIndex, setGenerationIndex] = useState<number | null>(null)
  const [generation, setGeneration] = useState<Generation>([])
  const [generationLifetime, setGenerationLifetime] = useState<number>(
    getIntSearchParam(GENERATION_LIFETIME_URL_PARAM, DEFAULT_GENERATION_LIFETIME)
  )

  const [cars, setCars] = useState<CarsType>({})
  const [carsBatch, setCarsBatch] = useState<CarType[]>([])
  const [carsBatchSize, setCarsBatchSize] = useState<number>(
    getIntSearchParam(GROUP_SIZE_URL_PARAM, DEFAULT_BATCH_SIZE)
  )
  const [carsBatchIndex, setCarsBatchIndex] = useState<number | null>(null)
  const carsRef = useRef<CarsType>({})

  const [bestGenome, setBestGenome] = useState<Genome | null>(null);
  const [minLoss, setMinLoss] = useState<number | null>(null);

  const [dynamicCarsPosition] = useState<DynamicCarsPosition>(DYNAMIC_CARS_POSITION_FRONT)

  const batchTimer = useRef<NodeJS.Timeout | null>(null)

  const carsLossRef = useRef<CarsLossType[]>([{}])
  const [lossHistory, setLossHistory] = useState<number[]>([])
  const [avgLossHistory, setAvgLossHistory] = useState<number[]>([])
  const genomeLossRef = useRef<GenomeLossType[]>([{}])

  const [mutationProbability, setMutationProbability] = useState<Probability>(
    getFloatSearchParam(MUTATION_PROBABILITY_URL_PARAM, DEFAULT_MUTATION_PROBABILITY)
  )
  const [longLivingChampionsPercentage, setLongLivingChampionsPercentage] = useState<Percentage>(
    getIntSearchParam(LONG_LIVING_CHAMPIONS_URL_PARAM, DEFAULT_LONG_LIVING_CHAMPIONS_PERCENTAGE)
  )

  const [badSimulationRetriesNum, setBadSimulationRetriesNum] = useState<number>(BAD_SIMULATION_RETRIES_NUM)

  const logger = loggerBuilder({ context: 'EvolutionTab' })
  const carsBatchesTotal: number = Math.ceil(Object.keys(cars).length / carsBatchSize) //SVAKU GENERACIJU PODIJELIMO U GRUPE/BATCHEVE -> NPR GENERACIJA IMA 100 AUTA -> TESTIRAMO 2 AUTA ODJEDNOM -> 50 BATCHEVA
  const batchVersion = generateWorldVersion(generationIndex, carsBatchIndex)
  const generationLifetimeMs = generationLifetime * SECOND

  //CUSTOM METHODS
  const handleMutationTypeChange = (newMutationType: string) => {
    mutationTypeChevronRef.current?.classList.remove('chevron-icon-active')
    setMutationDropdownOpen(false)
    if (newMutationType !== mutationType) {
      setMutationType(newMutationType);
    }
  }

  const handleSelectionTypeChange = (newSelectionType: string) => {
    selectionTypeChevronRef.current?.classList.remove('chevron-right-active')
    setSelectionDropdownOpen(false)
    if (newSelectionType !== selectionType) {
      setSelectionType(newSelectionType)
    }
  }

  const handleMutationTypeChevronClick = () => {
    mutationTypeChevronRef.current?.classList.toggle('chevron-icon-active')
    if (mutationTypeChevronRef.current?.classList.contains('chevron-icon-active')) {
      setMutationDropdownOpen(true)
    } else setMutationDropdownOpen(false)
  }

  const handleSelectionTypeChevronClick = () => {
    selectionTypeChevronRef.current?.classList.toggle('chevron-icon-active')
    if (selectionTypeChevronRef.current?.classList.contains('chevron-icon-active')) {
      setSelectionDropdownOpen(true)
    } else setSelectionDropdownOpen(false)
  }

  const handleGenerationSizeChange = (event: React.FormEvent<HTMLInputElement>) => {
    return;
  }

  const handleGroupSizeChange = (event: React.FormEvent<HTMLInputElement>) => {
    return;
  }

  const onCarLossUpdate = (licensePlate: CarLicencePlateType, loss: number) => {
    if (generationIndex === null) {
      return
    }

    // Save the car loss to the "LicencePlate → Loss" map.
    if (!carsLossRef.current[generationIndex]) {
      carsLossRef.current[generationIndex] = {}
    }
    carsLossRef.current[generationIndex][licensePlate] = loss

    // Save the car loss to the "GenomeKey → Loss" map.
    if (!genomeLossRef.current[generationIndex]) {
      genomeLossRef.current[generationIndex] = {}
    }
    if (carsRef.current[licensePlate]) {
      const carGenomeIndex = carsRef.current[licensePlate].genomeIndex
      const carGenome: Genome = generation[carGenomeIndex]
      const carGenomeKey: GenomeKey = carGenome.join('')
      genomeLossRef.current[generationIndex][carGenomeKey] = loss
    }
  }

  const cancelBatchTimer = () => {
    logger.info('Trying to cancel batch timer')
    if (batchTimer.current === null) {
      return
    }
    clearTimeout(batchTimer.current)
    batchTimer.current = null
  }

  const syncBestGenome = (): string | null | undefined => {
    if (generationIndex === null) {
      return;
    }

    const generationLoss: CarsLossType = carsLossRef.current[generationIndex];
    if (!generationLoss) {
      return;
    }

    let bestCarLicensePlate: CarLicencePlateType | null = null;
    let minLoss: number = Infinity;
    let bestGenomeIndex: number = -1;

    Object.keys(generationLoss).forEach((licencePlate: CarLicencePlateType) => {
      const carLoss: number | null = generationLoss[licencePlate];
      if (carLoss === null) {
        return;
      }
      if (carLoss < minLoss) {
        minLoss = carLoss;
        bestCarLicensePlate = licencePlate;
        bestGenomeIndex = cars[licencePlate].genomeIndex;
      }
    });

    if (bestGenomeIndex === -1) {
      return;
    }

    setMinLoss(minLoss);
    setBestGenome(generation[bestGenomeIndex]);

    return bestCarLicensePlate;
  }

  const syncLossHistory = () => {
    if (generationIndex === null) {
      return
    }
    const generationLoss: CarsLossType = carsLossRef.current[generationIndex]

    // Sync min loss history.
    const newLossHistory = [...lossHistory]
    if (generationLoss) {
      newLossHistory[generationIndex] = Object.values(generationLoss).reduce(
        (minVal: number, currVal: number | null) => {
          if (currVal === null) {
            return minVal
          }
          return Math.min(minVal, currVal)
        },
        Infinity
      )
    } else {
      newLossHistory[generationIndex] = Infinity
    }
    setLossHistory(newLossHistory)

    // Sync avg loss history.
    const newAvgLossHistory = [...avgLossHistory]
    if (generationLoss) {
      let nonNullLosses = 0

      const ascSortedGenerationLoss = Object.values<number | null>(generationLoss).sort(
        (a: number | null, b: number | null): number => {
          const aTuned: number = a === null ? Infinity : a
          const bTuned: number = b === null ? Infinity : b
          if (aTuned < bTuned) {
            return -1
          }
          if (aTuned > bTuned) {
            return 1
          }
          return 0
        }
      )

      const P50GenerationLoss = ascSortedGenerationLoss.slice(0, Math.ceil(ascSortedGenerationLoss.length * 0.5))

      const lossSum = P50GenerationLoss.reduce((sum: number, currVal: number | null) => {
        if (currVal === null) {
          return sum
        }
        nonNullLosses += 1
        return sum + currVal
      }, 0)
      newAvgLossHistory[generationIndex] = nonNullLosses ? lossSum / nonNullLosses : 0
    } else {
      newAvgLossHistory[generationIndex] = Infinity
    }
    setAvgLossHistory(newAvgLossHistory)
  }

  const carFitnessFunction =
    (generationIndex: number) =>
      (genome: Genome): number => {
        const genomeKey = genome.join('')
        if (
          generationIndex === null ||
          !genomeLossRef.current[generationIndex] ||
          typeof genomeLossRef.current[generationIndex][genomeKey] !== 'number'
        ) {
          throw new Error('Fitness value for specified genome is undefined')
        }
        const loss = genomeLossRef.current[generationIndex][genomeKey]
        if (typeof loss !== 'number') {
          throw new Error('Loss value is not a number')
        }
        return carLossToFitness(loss, FITNESS_ALPHA)
      }

  const isValidGenerationFromStorage = (generation: Generation | null): boolean => {
    return !!(generation && generation.length === generationSize && generation[0].length === GENOME_LENGTH)
  }

  const getGenerationIndexFromStorage = (): number | null => {
    const { generation: generationFromStorage, generationIndex: generationIndexFromStorage } =
      loadGenerationFromStorage()
    if (isValidGenerationFromStorage(generationFromStorage) && generationIndexFromStorage) {
      return generationIndexFromStorage
    }
    return null
  }

  const getLossHistoryFromStorage = (): number[] | null => {
    const { lossHistory: lossHistoryFromStorage, generation: generationFromStorage } = loadGenerationFromStorage()
    if (isValidGenerationFromStorage(generationFromStorage) && lossHistoryFromStorage) {
      return lossHistoryFromStorage
    }
    return null
  }

  const getAvgLossHistoryFromStorage = (): number[] | null => {
    const { avgLossHistory: avgLossHistoryFromStorage, generation: generationFromStorage } = loadGenerationFromStorage()
    if (isValidGenerationFromStorage(generationFromStorage) && avgLossHistoryFromStorage) {
      return avgLossHistoryFromStorage
    }
    return null
  }

  const getGenerationFromStorage = (): Generation | null => {
    const { generation: generationFromStorage } = loadGenerationFromStorage()
    if (isValidGenerationFromStorage(generationFromStorage)) {
      return generationFromStorage
    }
    if (generationFromStorage) {
      try {
        const debugGenerationSize = generationFromStorage.length
        const debugGenomeLength = generationFromStorage[0].length
        logger.warn(
          `Generation from storage is invalid: generation size ${debugGenerationSize}, genome length ${debugGenomeLength}`
        )
      } catch (err) {
        logger.warn('Generation from storage is invalid')
      }
    }
    return null
  }

  const startEvolution = () => {
    logger.info('Start evolution')
    let generationStartIndex = 0

    const generationIndexFromStorage = getGenerationIndexFromStorage()
    const lossHistoryFromStorage = getLossHistoryFromStorage()
    const avgLossHistoryFromStorage = getAvgLossHistoryFromStorage()

    if (generationIndexFromStorage && lossHistoryFromStorage && avgLossHistoryFromStorage) {
      generationStartIndex = generationIndexFromStorage
      setRestoredFromGenerationIndex(generationIndexFromStorage)
      setLossHistory(lossHistoryFromStorage)
      setAvgLossHistory(avgLossHistoryFromStorage)
    }

    setGenerationIndex(generationStartIndex)
  }

  const createFirstGeneration = () => {
    if (generationIndex === null) {
      return
    }
    logger.info('Create first generation')
    let firstGeneration: Generation = createGeneration({
      generationSize,
      genomeLength: GENOME_LENGTH,
    })

    const generationFromStorage: Generation | null = getGenerationFromStorage()
    const generationIndexFromStorage: number | null = getGenerationIndexFromStorage()
    if (generationFromStorage && generationIndexFromStorage) {
      firstGeneration = generationFromStorage
      enqueue(
        {
          message: `Generation #${generationIndexFromStorage} has been restored from the saved checkpoint. To start from scratch, press the Reset button.`,
          startEnhancer: ({ size }) => <BiUpload size={size} />,
        },
        DURATION.medium
      )
    }

    setGeneration(firstGeneration)
  }

  const mateExistingGeneration = () => {
    if (generationIndex === null) {
      return
    }
    logger.info(`Mate generation #${generationIndex}`)
    try {
      const newGeneration = select(generation, carFitnessFunction(generationIndex - 1), {
        mutationProbability,
        longLivingChampionsPercentage: longLivingChampionsPercentage,
      })
      setGeneration(newGeneration)
      saveGenerationToStorage({
        generation: newGeneration,
        generationIndex,
        lossHistory,
        avgLossHistory,
      })
    } catch (e: any) {
      // If selection failed for some reason, clone the existing generation and try again.
      setGeneration([...generation])
      const errorMessage =
        'The selection for the new generation has failed. Cloning the existing generation to try it next time.'
      const exceptionMessage = e && e.message ? e.message : ''
      logger.warn(errorMessage, exceptionMessage)
    }
  }

  const createCarsFromGeneration = () => {
    if (!generation || !generation.length) {
      return
    }
    logger.info(`Create cars from generation #${generationIndex}`)
    const cars = generationToCars({
      generation,
      generationIndex,
      onLossUpdate: onCarLossUpdate,
    })
    setCars(cars)
    setCarsBatchIndex(0)
    carsRef.current = _.cloneDeep(cars)
  }

  const generateNextCarsBatch = () => {
    if (carsBatchIndex === null || generationIndex === null) {
      return
    }
    if (!cars || !Object.keys(cars).length) {
      return
    }
    if (carsBatchIndex >= carsBatchesTotal) {
      return
    }
    logger.info(`Generate cars batch #${carsBatchIndex}`)
    const batchStart = carsBatchSize * carsBatchIndex
    const batchEnd = batchStart + carsBatchSize
    const carsBatch: CarType[] = Object.values(cars).slice(batchStart, batchEnd)
    setCarsBatch(carsBatch)
  }

  const needToRetry =
    BAD_SIMULATION_RETRIES_ENABLED &&
    carsBatchIndex === BAD_SIMULATION_BATCH_INDEX_CHECK &&
    badSimulationRetriesNum > 0 &&
    lossHistory.length > 1 &&
    lossHistory[lossHistory.length - 1] >
    (lossHistory[lossHistory.length - 2] * BAD_SIMULATION_MIN_LOSS_INCREASE_PERCENTAGE) / 100

  const onBatchLifetimeEnd = () => {
    console.log('Kraj trenutne grupe')
    if (carsBatchIndex === null) {
      return
    }
    logger.info(`Batch #${carsBatchIndex} lifetime ended`)
    syncLossHistory()
    const bestLicensePlate = syncBestGenome()
    let nextBatchIndex = carsBatchIndex + 1

    // Retrying logic
    if (BAD_SIMULATION_RETRIES_ENABLED && carsBatchIndex) {
      if (badSimulationRetriesNum === 0) {
        if (carsBatchIndex > BAD_SIMULATION_BATCH_INDEX_CHECK) {
          logger.info(`Resetting the simulation retries counter back to #${BAD_SIMULATION_RETRIES_NUM}`)
          setBadSimulationRetriesNum(BAD_SIMULATION_RETRIES_NUM)
        }
      } else if (needToRetry) {
        logger.info(`Retry needed. Number of retries left: ${badSimulationRetriesNum - 1}`)
        setBadSimulationRetriesNum(badSimulationRetriesNum - 1)
        nextBatchIndex = 0
      }
    }

    if (nextBatchIndex >= carsBatchesTotal) {
      setCarsBatch([])
      if (generationIndex !== null) {
        setCarsBatchIndex(null)
        setGenerationIndex(generationIndex + 1)
      }
      return
    }
    setCarsBatchIndex(nextBatchIndex)
  }
  const countDownBatchLifetime = (onLifetimeEnd: () => void) => {
    if (carsBatchIndex === null) {
      return
    }
    if (!carsBatch || !carsBatch.length) {
      return
    }
    logger.info(`Batch #${carsBatchIndex} lifetime started`)
    cancelBatchTimer()
    batchTimer.current = setTimeout(onLifetimeEnd, generationLifetimeMs)
  }

  // Start the evolution.
  useEffect(() => {
    //component did mount -> pocni zapocni evoluciju
    startEvolution()
  }, [])

  // Once generation index is changed we need to create (or mate) a new generation.
  useEffect(() => {
    //PROMJENA GENERACIJE -> KRIZANJE
    console.log('Generation index use efect')
    //if(!isPaused) {
    if (generationIndex === 0 || generationIndex === restoredFromGenerationIndex) {
      createFirstGeneration()
    } else {
      mateExistingGeneration()
    }
    //}
  }, [generationIndex, worldIndex])

  // Once generation is changed we need to create cars.
  useEffect(() => {
    //KREIRANJE NOVIH AUTA IZ NOVE GENERACIJE
    console.log('Generation use efect')
    createCarsFromGeneration()
  }, [generation])

  // Once the cars batch index is updated we need to generate a cars batch.
  useEffect(() => {
    // NOVA GRUPA AUTA IZ GENERACIJE -> GENEIRAJ NOVU GRUPU
    console.log('Cars batch useeffect')
    if (updateScene) {
      generateNextCarsBatch()
    }
  }, [carsBatchIndex])

  // Once the new cars batch is created we need to start generation timer.
  useEffect(() => {
    //ODBROJAVANJE VREMENA KOJE DAJEMO AUTIMA IZ GRUPE DA EVOLUIRAJU I TRENIRAJU SE
    if (updateScene) {
      countDownBatchLifetime(onBatchLifetimeEnd)
    }
    if (isPaused) {
      setUpdateScene(false)
    }
    return () => {
      //use effect clenaup timer
      cancelBatchTimer()
    }
  }, [carsBatch])

  return (
    <Block>
      <World version={batchVersion} performanceBoost={performanceBoost} updateScene={updateScene}>
        {updateScene ? (
          <ParkingAutomatic
            performanceBoost={performanceBoost}
            cars={carsBatch} //rerender kod promjene novog batcha automobila
            withVisibleSensors
            withLabels
            carsPosition={dynamicCarsPosition} //pocetna poizicija kretajucih auta
          />
        ) : null}
      </World>
      <div style={{ textAlign: 'center' }}>
        <div className="button" onClick={() => setIsPaused(!isPaused)}>
          {isPaused ? 'PLAY' : 'PAUSE'}
        </div>
      </div>
      <div className="content-block">
        <h2>Generation parameters</h2>
        <div className="parameters-container">
          <div className="generation-parameter">
            <div>Generation:</div>
            <div>{generationIndex !== null ? generationIndex + 1 : null}</div>
          </div>
          <div className="generation-parameter">
            <div>Group:</div>
            <div>{`${carsBatchIndex !== null ? carsBatchIndex + 1 : null}/${carsBatchesTotal}`}</div>
          </div>
          <div className="generation-parameter">
            <div>Group lifetime left:</div>
            <div><Timer timeout={generationLifetimeMs} version={batchVersion} /></div>
          </div>
        </div>
        <div className="parameters-container editable">
          <div className="generation-parameter-editable">
            <div className="generation-parameter">
              <div>Generation size:</div>
              <div>{generationSize}</div>
            </div>
            <input
              type="range"
              step={1}
              value={generationSize}
              min={1}
              max={150}
              onChange={handleGenerationSizeChange}
            />
          </div>
          <div className="generation-parameter-editable">
            <div className="generation-parameter">
              <div>Group size:</div>
              <div>{carsBatchSize}</div>
            </div>
            <input
              type="range"
              step={1}
              value={carsBatchSize}
              min={1}
              max={generationSize}
              onChange={handleGroupSizeChange}
            />
          </div>
        </div>
      </div>
      <div className="content-block">
        <h2>Algorithm parameters</h2>
        <div className="parameters-container">
          <div className="generation-parameter">
            <div>Mutation probability:</div>
            <div>{`${mutationProbability * 100}%`}</div>
          </div>
          <div className="generation-parameter">
            <div>Elitism rate:</div>
            <div>{`${longLivingChampionsPercentage}%`}</div>
          </div>
          <div className="generation-parameter">
            <div>Time elapsed:</div>
            <div><Timer /></div>
          </div>
        </div>
      </div>
      <div className="mutation-selection-container">
        <div className="select-form-control">
          <h2>Mutation type</h2>
          <div className="select-container">
            <span>First mutation</span>
            <div ref={mutationTypeChevronRef} className="chevron-icon" onClick={handleMutationTypeChevronClick}>
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
            <div className="select-dropdown" style={{ opacity: (mutationDropdownOpen) ? 1 : 0 }}>
              <div onClick={() => handleMutationTypeChange('First mutation')} className="select-dropdown-item">First mutation</div>
              <div onClick={() => handleMutationTypeChange('Second mutation')} className="select-dropdown-item">Second mutation</div>
              <div onClick={() => handleMutationTypeChange('Third mutation')} className="select-dropdown-item">Third mutation</div>
            </div>
          </div>
        </div>
        <div className="select-form-control">
          <h2>Selection type</h2>
          <div className="select-container">
            <span>First selection</span>
            <div ref={selectionTypeChevronRef} className="chevron-icon" onClick={handleSelectionTypeChevronClick}>
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
            <div className="select-dropdown" style={{ opacity: (selectionDropdownOpen) ? 1 : 0 }}>
              <div onClick={() => handleSelectionTypeChange('First selection')} className="select-dropdown-item">First selection</div>
              <div onClick={() => handleSelectionTypeChange('Second selection')} className="select-dropdown-item">Second selection</div>
              <div onClick={() => handleSelectionTypeChange('Third selection')} className="select-dropdown-item">Third selection</div>
            </div>
          </div>
        </div>
      </div>
      <div className="content-block">
        <h2>Best car from generation</h2>
        <div className="car-parameter-container">
          <h3>Car genome</h3>
          <code >{(bestGenome) ? bestGenome.join(' ') : 'Not yet determined'}</code>
          <div className="footer">
            <div className="parameter">
              <div>Number of genes:</div>
              <div>180</div>
            </div>
            <div className="parameter">
              <div>Min loss:</div>
              <div>{formatLossValue(minLoss)}</div>
            </div>
            <div className="parameter">
              <div>Fitness:</div>
              <div>{minLoss ? formatLossValue(carLossToFitness(minLoss, FITNESS_ALPHA)) : 0}</div>
            </div>
          </div>
        </div>
        <div className="car-parameter-container">
          <h3>Engine formula coefficents</h3>
          <code>{(bestGenome) ? decodeGenome((bestGenome)).engineFormulaCoefficients.map((coefficient: number) => formatCoefficient(coefficient, true)).join(', ') : 'Not yet determined'}</code>
          <div className="footer">
            <div className="parameter">
              <div>
                Coefficients for engine multivariate linear formula. Given in order x<sub>8</sub>, x<sub>7</sub>, ...
                , x<sub>0</sub>
              </div>
            </div>
          </div>
        </div>
        <div className="car-parameter-container">
          <h3>Wheel formula coefficents</h3>
          <code>{(bestGenome) ? decodeGenome((bestGenome)).wheelsFormulaCoefficients.map((coefficient: number) => formatCoefficient(coefficient, true)).join(', ') : 'Not yet determined'}</code>
          <div className="footer">
            <div className="parameter">
              <div>
                Coefficients for engine multivariate linear formula. Given in order x<sub>8</sub>, x<sub>7</sub>, ...
                , x<sub>0</sub>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/*       onGenerationSizeChange={onGenerationSizeChange}
      onBatchSizeChange={onBatchSizeChange}
      onGenerationLifetimeChange={onGenerationLifetimeChange}
      onLongLivingChampionsPercentageChange={onLongLivingChampionsPercentageChange}
      onMutationProbabilityChange={onMutationProbabilityChange} */}
    </Block>
  )
}

export default EvolutionTabEvolution
