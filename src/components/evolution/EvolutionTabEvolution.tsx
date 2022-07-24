import { useEffect, useRef, useState } from 'react';
import _ from 'lodash';
import { Block } from 'baseui/block';
import { useSnackbar, DURATION } from 'baseui/snackbar';
import { BiUpload } from 'react-icons/all';

import { createGeneration, Generation, Genome, Percentage, Probability, select } from '../../libs/genetic';
import { CarsLossType } from './PopulationTable';
import { CarLicencePlateType, CarsType, CarType } from '../world/types/car';
import { carLossToFitness, GENOME_LENGTH } from '../../libs/carGenetic';
import {
  generateWorldVersion,
  generationToCars,
  loadGenerationFromStorage,
  saveGenerationToStorage
} from './utils/evolution';
import { 
  getBooleanSearchParam,
  getFloatSearchParam,
  getIntSearchParam,
} from '../../utils/url';
import { loggerBuilder } from '../../utils/logger';
import ParkingAutomatic from '../world/parkings/ParkingAutomatic';
import World from '../world/World';
import { BAD_SIMULATION_BATCH_INDEX_CHECK, BAD_SIMULATION_MIN_LOSS_INCREASE_PERCENTAGE, BAD_SIMULATION_RETRIES_ENABLED, BAD_SIMULATION_RETRIES_NUM, FITNESS_ALPHA } from './constants/evolution';
import { DynamicCarsPosition } from '../world/constants/cars';
import { DYNAMIC_CARS_POSITION_FRONT } from '../world/constants/cars';

//EVOLUTION PARAMS
const DEFAULT_PERFORMANCE_BOOST: boolean = false;
const DEFAULT_GENERATION_SIZE: number = 100;
const DEFAULT_BATCH_SIZE: number = 2;
const DEFAULT_MUTATION_PROBABILITY: Probability = 0.04;
const DEFAULT_LONG_LIVING_CHAMPIONS_PERCENTAGE: Percentage = 6;
const DEFAULT_GENERATION_LIFETIME: number = 17;
const TRAINED_CAR_GENERATION_LIFETIME: number = DEFAULT_GENERATION_LIFETIME;
const SECOND: number = 1000;

const GENERATION_SIZE_URL_PARAM = 'generation';
const GROUP_SIZE_URL_PARAM = 'group';
const GENERATION_LIFETIME_URL_PARAM = 'lifetime';
const MUTATION_PROBABILITY_URL_PARAM = 'mutation';
const LONG_LIVING_CHAMPIONS_URL_PARAM = 'champions';
const PERFORMANCE_BOOST_URL_PARAM = 'boost';

//  Genome array, concatenated to a string (i.e. '1010011')
type GenomeKey = string;

type GenomeLossType = Record<GenomeKey, number | null>;

function EvolutionTabEvolution() {
  const {enqueue} = useSnackbar();

  const [performanceBoost, setPerformanceBoost] = useState<boolean>(
    getBooleanSearchParam(PERFORMANCE_BOOST_URL_PARAM, DEFAULT_PERFORMANCE_BOOST)
  );

  const [worldIndex, setWorldIndex] = useState<number>(0);

  const [generationSize, setGenerationSize] = useState<number>(
    getIntSearchParam(GENERATION_SIZE_URL_PARAM, DEFAULT_GENERATION_SIZE)
  );
  const [restoredFromGenerationIndex, setRestoredFromGenerationIndex] = useState<number | null>(null);
  const [generationIndex, setGenerationIndex] = useState<number | null>(null);
  const [generation, setGeneration] = useState<Generation>([]);
  const [generationLifetime, setGenerationLifetime] = useState<number>(
    getIntSearchParam(GENERATION_LIFETIME_URL_PARAM, DEFAULT_GENERATION_LIFETIME)
  );

  const [cars, setCars] = useState<CarsType>({});
  const [carsBatch, setCarsBatch] = useState<CarType[]>([]);
  const [carsBatchSize, setCarsBatchSize] = useState<number>(
    getIntSearchParam(GROUP_SIZE_URL_PARAM, DEFAULT_BATCH_SIZE)
  );
  const [carsBatchIndex, setCarsBatchIndex] = useState<number | null>(null);
  const carsRef = useRef<CarsType>({});

  const [dynamicCarsPosition] = useState<DynamicCarsPosition>(DYNAMIC_CARS_POSITION_FRONT);

  const batchTimer = useRef<NodeJS.Timeout | null>(null);

  const carsLossRef = useRef<CarsLossType[]>([{}]);
  const [lossHistory, setLossHistory] = useState<number[]>([]);
  const [avgLossHistory, setAvgLossHistory] = useState<number[]>([]);
  const genomeLossRef = useRef<GenomeLossType[]>([{}]);

  const [mutationProbability, setMutationProbability] = useState<Probability>(
    getFloatSearchParam(MUTATION_PROBABILITY_URL_PARAM, DEFAULT_MUTATION_PROBABILITY)
  );
  const [longLivingChampionsPercentage, setLongLivingChampionsPercentage] = useState<Percentage>(
    getIntSearchParam(LONG_LIVING_CHAMPIONS_URL_PARAM, DEFAULT_LONG_LIVING_CHAMPIONS_PERCENTAGE)
  );

  const [badSimulationRetriesNum, setBadSimulationRetriesNum] = useState<number>(BAD_SIMULATION_RETRIES_NUM);

  const logger = loggerBuilder({ context: 'EvolutionTab' });
  const carsBatchesTotal: number = Math.ceil(Object.keys(cars).length / carsBatchSize);
  const batchVersion = generateWorldVersion(generationIndex, carsBatchIndex);
  const generationLifetimeMs = generationLifetime * SECOND;

  const onCommonStateReset = () => {
    setGeneration([]);
    setCarsBatch([]);
    setCars({});
    carsRef.current = {};
    carsLossRef.current = [{}];
    genomeLossRef.current = [{}];
    setLossHistory([]);
    setAvgLossHistory([]);
  };

  const onCarLossUpdate = (licensePlate: CarLicencePlateType, loss: number) => {
    if (generationIndex === null) {
      return;
    }

    // Save the car loss to the "LicencePlate → Loss" map.
    if (!carsLossRef.current[generationIndex]) {
      carsLossRef.current[generationIndex] = {};
    }
    carsLossRef.current[generationIndex][licensePlate] = loss;

    // Save the car loss to the "GenomeKey → Loss" map.
    if (!genomeLossRef.current[generationIndex]) {
      genomeLossRef.current[generationIndex] = {};
    }
    if (carsRef.current[licensePlate]) {
      const carGenomeIndex = carsRef.current[licensePlate].genomeIndex;
      const carGenome: Genome = generation[carGenomeIndex];
      const carGenomeKey: GenomeKey = carGenome.join('');
      genomeLossRef.current[generationIndex][carGenomeKey] = loss;
    }
  };


  const cancelBatchTimer = () => {
    logger.info('Trying to cancel batch timer');
    if (batchTimer.current === null) {
      return;
    }
    clearTimeout(batchTimer.current);
    batchTimer.current = null;
  };

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

    return bestCarLicensePlate;
  };

  const syncSecondBestGenome = (
    bestLicensePlateSoFar: string | null | undefined
  ): string | null | undefined => {
    if (generationIndex === null || !bestLicensePlateSoFar) {
      return;
    }

    const generationLoss: CarsLossType = carsLossRef.current[generationIndex];
    if (!generationLoss) {
      return;
    }

    let secondBestCarLicensePlate: CarLicencePlateType | null = null;
    let secondMinLoss: number = Infinity;
    let secondBestGenomeIndex: number = -1;

    Object.keys(generationLoss).forEach((licencePlate: CarLicencePlateType) => {
      // Skipping the best car genome.
      if (licencePlate === bestLicensePlateSoFar) {
        return;
      }
      const carLoss: number | null = generationLoss[licencePlate];
      if (carLoss === null) {
        return;
      }
      if (carLoss < secondMinLoss) {
        secondMinLoss = carLoss;
        secondBestCarLicensePlate = licencePlate;
        secondBestGenomeIndex = cars[licencePlate].genomeIndex;
      }
    });

    if (secondBestGenomeIndex === -1) {
      return;
    }

    return secondBestCarLicensePlate;
  };

  const syncLossHistory = () => {
    if (generationIndex === null) {
      return;
    }
    const generationLoss: CarsLossType = carsLossRef.current[generationIndex];

    // Sync min loss history.
    const newLossHistory = [...lossHistory];
    if (generationLoss) {
      newLossHistory[generationIndex] = Object.values(generationLoss).reduce(
        (minVal: number, currVal: number | null) => {
          if (currVal === null) {
            return minVal;
          }
          return Math.min(minVal, currVal);
        },
        Infinity
      );
    } else {
      newLossHistory[generationIndex] = Infinity;
    }
    setLossHistory(newLossHistory);

    // Sync avg loss history.
    const newAvgLossHistory = [...avgLossHistory];
    if (generationLoss) {
      let nonNullLosses = 0;

      const ascSortedGenerationLoss = Object.values<number | null>(generationLoss)
        .sort((a: number | null, b: number | null): number => {
          const aTuned: number = a === null ? Infinity : a;
          const bTuned: number = b === null ? Infinity : b;
          if (aTuned < bTuned) {
            return -1;
          }
          if (aTuned > bTuned) {
            return 1;
          }
          return 0;
        }
      );

      const P50GenerationLoss = ascSortedGenerationLoss.slice(
        0,
        Math.ceil(ascSortedGenerationLoss.length * 0.5),
      );

      const lossSum = P50GenerationLoss.reduce(
        (sum: number, currVal: number | null) => {
          if (currVal === null) {
            return sum;
          }
          nonNullLosses += 1;
          return sum + currVal;
        },
        0
      );
      newAvgLossHistory[generationIndex] = nonNullLosses ? lossSum / nonNullLosses : 0;
    } else {
      newAvgLossHistory[generationIndex] = Infinity;
    }
    setAvgLossHistory(newAvgLossHistory);
  };

  const carFitnessFunction = (generationIndex: number) => (genome: Genome): number => {
    const genomeKey = genome.join('');
    if (
      generationIndex === null ||
      !genomeLossRef.current[generationIndex] ||
      typeof genomeLossRef.current[generationIndex][genomeKey] !== 'number'
    ) {
      throw new Error('Fitness value for specified genome is undefined');
    }
    const loss = genomeLossRef.current[generationIndex][genomeKey];
    if (typeof loss !== 'number') {
      throw new Error('Loss value is not a number');
    }
    return carLossToFitness(loss, FITNESS_ALPHA);
  };

  const isValidGenerationFromStorage = (generation: Generation | null): boolean => {
    return !!(
      generation &&
      generation.length === generationSize &&
      generation[0].length === GENOME_LENGTH
    );
  };

  const getGenerationIndexFromStorage = (): number | null => {
    const {
      generation: generationFromStorage,
      generationIndex: generationIndexFromStorage,
    } = loadGenerationFromStorage();
    if (
      isValidGenerationFromStorage(generationFromStorage) &&
      generationIndexFromStorage
    ) {
      return generationIndexFromStorage;
    }
    return null;
  };

  const getLossHistoryFromStorage = (): number[] | null => {
    const {
      lossHistory: lossHistoryFromStorage,
      generation: generationFromStorage,
    } = loadGenerationFromStorage();
    if (
      isValidGenerationFromStorage(generationFromStorage) &&
      lossHistoryFromStorage
    ) {
      return lossHistoryFromStorage;
    }
    return null;
  };

  const getAvgLossHistoryFromStorage = (): number[] | null => {
    const {
      avgLossHistory: avgLossHistoryFromStorage,
      generation: generationFromStorage,
    } = loadGenerationFromStorage();
    if (
      isValidGenerationFromStorage(generationFromStorage) &&
      avgLossHistoryFromStorage
    ) {
      return avgLossHistoryFromStorage;
    }
    return null;
  };

  const getGenerationFromStorage = (): Generation | null => {
    const {
      generation: generationFromStorage,
    } = loadGenerationFromStorage();
    if (isValidGenerationFromStorage(generationFromStorage)) {
      return generationFromStorage;
    }
    if (generationFromStorage) {
      try {
        const debugGenerationSize = generationFromStorage.length;
        const debugGenomeLength = generationFromStorage[0].length;
        logger.warn(`Generation from storage is invalid: generation size ${debugGenerationSize}, genome length ${debugGenomeLength}`);
      } catch (err) {
        logger.warn('Generation from storage is invalid');
      }
    }
    return null;
  };

  const startEvolution = () => {
    logger.info('Start evolution');
    let generationStartIndex = 0;

    const generationIndexFromStorage = getGenerationIndexFromStorage();
    const lossHistoryFromStorage = getLossHistoryFromStorage();
    const avgLossHistoryFromStorage = getAvgLossHistoryFromStorage();

    if (generationIndexFromStorage && lossHistoryFromStorage && avgLossHistoryFromStorage) {
      generationStartIndex = generationIndexFromStorage;
      setRestoredFromGenerationIndex(generationIndexFromStorage);
      setLossHistory(lossHistoryFromStorage);
      setAvgLossHistory(avgLossHistoryFromStorage);
    }

    setGenerationIndex(generationStartIndex);
  };

  const createFirstGeneration = () => {
    if (generationIndex === null) {
      return;
    }
    logger.info('Create first generation');
    let firstGeneration: Generation = createGeneration({
      generationSize,
      genomeLength: GENOME_LENGTH,
    });

    const generationFromStorage: Generation | null = getGenerationFromStorage();
    const generationIndexFromStorage: number | null = getGenerationIndexFromStorage();
    if (generationFromStorage && generationIndexFromStorage) {
      firstGeneration = generationFromStorage;
      enqueue({
        message:
          `Generation #${generationIndexFromStorage} has been restored from the saved checkpoint. To start from scratch, press the Reset button.`,
        startEnhancer: ({size}) => <BiUpload size={size} />,
      }, DURATION.medium);
    }

    setGeneration(firstGeneration);
  };

  const mateExistingGeneration = () => {
    if (generationIndex === null) {
      return;
    }
    logger.info(`Mate generation #${generationIndex}`);
    try {
      const newGeneration = select(
        generation,
        carFitnessFunction(generationIndex - 1),
        {
          mutationProbability,
          longLivingChampionsPercentage: longLivingChampionsPercentage,
        },
      );
      setGeneration(newGeneration);
      saveGenerationToStorage({
        generation: newGeneration,
        generationIndex,
        lossHistory,
        avgLossHistory,
      });
    } catch (e: any) {
      // If selection failed for some reason, clone the existing generation and try again.
      setGeneration([...generation]);
      const errorMessage = 'The selection for the new generation has failed. Cloning the existing generation to try it next time.';
      const exceptionMessage = e && e.message ? e.message : '';
      logger.warn(errorMessage, exceptionMessage);
    }
  };

  const createCarsFromGeneration = () => {
    if (!generation || !generation.length) {
      return;
    }
    logger.info(`Create cars from generation #${generationIndex}`);
    const cars = generationToCars({
      generation,
      generationIndex,
      onLossUpdate: onCarLossUpdate,
    });
    setCars(cars);
    setCarsBatchIndex(0);
    carsRef.current = _.cloneDeep(cars);
  };

  const generateNextCarsBatch = () => {
    if (carsBatchIndex === null || generationIndex === null) {
      return;
    }
    if (!cars || !Object.keys(cars).length) {
      return;
    }
    if (carsBatchIndex >= carsBatchesTotal) {
      return;
    }
    logger.info(`Generate cars batch #${carsBatchIndex}`);
    const batchStart = carsBatchSize * carsBatchIndex;
    const batchEnd = batchStart + carsBatchSize;
    const carsBatch: CarType[] = Object.values(cars).slice(batchStart, batchEnd);
    setCarsBatch(carsBatch);
  };

  const needToRetry = 
    BAD_SIMULATION_RETRIES_ENABLED &&
    carsBatchIndex === BAD_SIMULATION_BATCH_INDEX_CHECK &&
    badSimulationRetriesNum > 0 &&
    lossHistory.length > 1 &&
    lossHistory[lossHistory.length - 1] > (lossHistory[lossHistory.length - 2] * BAD_SIMULATION_MIN_LOSS_INCREASE_PERCENTAGE / 100);

  const onBatchLifetimeEnd = () => {
    if (carsBatchIndex === null) {
      return;
    }
    logger.info(`Batch #${carsBatchIndex} lifetime ended`);
    syncLossHistory();
    const bestLicensePlate = syncBestGenome();
    syncSecondBestGenome(bestLicensePlate);
    let nextBatchIndex = carsBatchIndex + 1;

    // Retrying logic
    if (BAD_SIMULATION_RETRIES_ENABLED && carsBatchIndex) {
      if (badSimulationRetriesNum === 0) {
        if (carsBatchIndex > BAD_SIMULATION_BATCH_INDEX_CHECK) {
          logger.info(`Resetting the simulation retries counter back to #${BAD_SIMULATION_RETRIES_NUM}`);
          setBadSimulationRetriesNum(BAD_SIMULATION_RETRIES_NUM);
        }
      } else if (needToRetry) {
        logger.info(`Retry needed. Number of retries left: ${badSimulationRetriesNum - 1}`);
        setBadSimulationRetriesNum(badSimulationRetriesNum - 1);
        nextBatchIndex = 0;
      }
    }

    if (nextBatchIndex >= carsBatchesTotal) {
      setCarsBatch([]);
      if (generationIndex !== null) {
        setCarsBatchIndex(null);
        setGenerationIndex(generationIndex + 1);
      }
      return;
    }
    setCarsBatchIndex(nextBatchIndex);
  };

  const countDownBatchLifetime = (onLifetimeEnd: () => void) => {
    if (carsBatchIndex === null) {
      return;
    }
    if (!carsBatch || !carsBatch.length) {
      return;
    }
    logger.info(`Batch #${carsBatchIndex} lifetime started`);
    cancelBatchTimer();
    batchTimer.current = setTimeout(onLifetimeEnd, generationLifetimeMs);
  };

  // Start the evolution.
  useEffect(() => {
    startEvolution();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once generation index is changed we need to create (or mate) a new generation.
  useEffect(() => {
    if (generationIndex === 0 || generationIndex === restoredFromGenerationIndex) {
      createFirstGeneration();
    } else {
      mateExistingGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationIndex, worldIndex]);

  // Once generation is changed we need to create cars.
  useEffect(() => {
    createCarsFromGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  // Once the cars batch index is updated we need to generate a cars batch.
  useEffect(() => {
    generateNextCarsBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carsBatchIndex]);

  // Once the new cars batch is created we need to start generation timer.
  useEffect(() => {
    countDownBatchLifetime(onBatchLifetimeEnd);
    return () => {
      cancelBatchTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carsBatch]);

  return (
    <Block>
      <World
        version={batchVersion}
        performanceBoost={performanceBoost}
      >
        <ParkingAutomatic
          performanceBoost={performanceBoost}
          cars={carsBatch}
          withVisibleSensors
          withLabels
          carsPosition={dynamicCarsPosition}
        />
      </World>

{/*       <Block marginTop="30px">
        <EvolutionCheckpointSaver
          onRestoreFromCheckpoint={onRestoreFromCheckpoint}
          onCheckpointToFile={onCheckpointToFile}
        />
      </Block> */}
    </Block>
  );
}

export default EvolutionTabEvolution;