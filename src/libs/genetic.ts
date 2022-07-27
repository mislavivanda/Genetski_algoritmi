import { weightedRandom } from './math/probability'

export type Gene = 0 | 1

export type Genome = Gene[]

export type Generation = Genome[]

export type GenerationParams = {
  generationSize: number
  genomeLength: number
}

function createGenome(length: number): Genome {
  return new Array(length).fill(null).map(() => (Math.random() < 0.5 ? 0 : 1))
}

export function createGeneration(params: GenerationParams): Generation {
  const { generationSize, genomeLength } = params
  return new Array(generationSize).fill(null).map(() => createGenome(genomeLength))
}

// The number between 0 and 1.
export type Probability = number

// The number between 0 and 100.
export type Percentage = number

// @see: https://en.wikipedia.org/wiki/Mutation_(genetic_algorithm)
//DEFAULTNA MUTACIJA
function mutate(genome: Genome, mutationProbability: Probability, mutationType: string): Genome {
  // Conceive children.
  for (let geneIndex = 0; geneIndex < genome.length; geneIndex += 1) {
    if (mutationType === 'Bit flip') {
      const gene: Gene = genome[geneIndex]
      const mutatedGene: Gene = gene === 0 ? 1 : 0
      genome[geneIndex] = Math.random() < mutationProbability ? mutatedGene : gene
    }
    if (mutationType === 'Swap') {
      if (Math.random() < mutationProbability) {
        const gene = genome[geneIndex]
        let indexToSwap = Math.min(Math.floor(Math.random() * 180), 179)
        genome[geneIndex] = genome[indexToSwap]
        genome[indexToSwap] = gene
      }
    }
  }
  return genome
}

type SelectionOptions = {
  mutationProbability: Probability
  longLivingChampionsPercentage: Percentage
  selectionType: string
  mutationType: string
}

// Performs Uniform Crossover: each bit is chosen from either parent with equal probability.
// @see: https://en.wikipedia.org/wiki/Crossover_(genetic_algorithm)
function mate(
  father: Genome,
  mother: Genome,
  mutationProbability: Probability,
  mutationType: string
): [Genome, Genome] {
  if (father.length !== mother.length) {
    throw new Error('Cannot mate different species')
  }

  const firstChild: Genome = []
  const secondChild: Genome = []

  // Conceive children.
  //KRIZANJE -> NA RANDOM NACIN OZNACI OD KOJEG CES RODITELJA NASLIJEDTI KOJI BIT GENOME -> 50/50
  for (let geneIndex = 0; geneIndex < father.length; geneIndex += 1) {
    firstChild.push(Math.random() < 0.5 ? father[geneIndex] : mother[geneIndex])
    secondChild.push(Math.random() < 0.5 ? father[geneIndex] : mother[geneIndex])
  }

  return [mutate(firstChild, mutationProbability, mutationType), mutate(secondChild, mutationProbability, mutationType)]
}

export type FitnessFunction = (genome: Genome) => number

// @see: https://en.wikipedia.org/wiki/Selection_(genetic_algorithm)
export function select(generation: Generation, fitness: FitnessFunction, options: SelectionOptions) {
  const { mutationProbability, longLivingChampionsPercentage, selectionType, mutationType } = options

  const newGeneration: Generation = []

  const oldGeneration = [...generation]
  // First one - the fittest one.
  //sortiraj po futnessu
  oldGeneration.sort((genomeA: Genome, genomeB: Genome): number => {
    const fitnessA = fitness(genomeA)
    const fitnessB = fitness(genomeB)
    if (fitnessA < fitnessB) {
      return 1
    }
    if (fitnessA > fitnessB) {
      return -1
    }
    return 0
  })

  // Let long-liver champions continue living in the new generation.
  //ELITISM RATE -> PREBACI ODREDENI POSTOTAK NAJBOLJIH DIREKTNO U NOVU GENERACIJU
  const longLiversCount = Math.floor((longLivingChampionsPercentage * oldGeneration.length) / 100)
  if (longLiversCount) {
    oldGeneration.slice(0, longLiversCount).forEach((longLivingGenome: Genome) => {
      newGeneration.push(longLivingGenome)
    })
  }

  // Get the data about he fitness of each individuum.
  const fitnessPerOldGenome: number[] = oldGeneration.map((genome: Genome) => fitness(genome))

  //RoulleteWheel Selection
  const FindParentIndex = (relativeFitness: any, randomNumber: any) => {
    let i = 0
    while (randomNumber > relativeFitness[i]) i += 1
    return i
  }
  let relativeFitness: any = []
  let fitnessList: any = []
  if (selectionType === 'Roullete wheel') {
    let totalFitness = 0.0
    generation.forEach((genome) => {
      totalFitness += fitness(genome)
    })
    generation.forEach((genome) => {
      relativeFitness.push(fitness(genome))
    })
    for (let i = 0; i < relativeFitness.length; i++) {
      for (let j = 0; j < i; j++) relativeFitness[j] += relativeFitness[j]
    }
  }
  //RoulleteWheel Selection

  //Rank Selection
  let indexList: any = []
  const FindParentIndexRankSelection = (relativeFitness: any, indexList: any, randomNumber: any) => {
    let i = 0
    while (randomNumber > relativeFitness[i]) i += 1
    return indexList[i]
  }
  if (selectionType === 'Rank selection') {
    generation.forEach((genome) => {
      fitnessList.push(fitness(genome))
    })
    let fitnessListCopy = [...fitnessList]
    fitnessList.sort()
    fitnessList.forEach((fitness: any) => {
      let tempIndex = fitnessListCopy.indexOf(fitness)
      indexList.push(tempIndex)
    })
    let rankList: any = []
    let newFitness = 0.0
    indexList.forEach(() => {
      newFitness += 1.0
      rankList.push(newFitness)
    })
    for (let i = 0; i < relativeFitness.length; i++) {
      for (let j = 0; j < i; j++) rankList[j] += rankList[j]
    }
  }
  //Rank Selection

  //Tournament selection
  let tournamentSize = Math.floor(generation.length / 2)
  let size
  const createRandomList = (length: any, size: any) => {
    let randomList = []
    for (let i = 0; i < length; i++) {
      let n = Math.floor(Math.random() * size)
      randomList.push(n)
    }
    return randomList
  }
  if (selectionType === 'Tournament') {
    generation.forEach((genome) => {
      fitnessList.push(fitness(genome))
    })
    size = fitnessList.length
  }
  //Tournament selection

  // Populate the next generation until it becomes the same size as a old generation.
  while (newGeneration.length < generation.length) {
    // Select random father and mother from the population.
    // The fittest individuums have higher chances to be selected.
    //DEFAULTNI ALGORITAM SELEKCIJE
    let father: Genome | null = null
    let fatherGenomeIndex: number | null = null
    let mother: Genome | null = null
    let matherGenomeIndex: number | null = null

    // To produce children the father and mother need each other.
    // It must be two different individuums.
    while (!father || !mother || fatherGenomeIndex === matherGenomeIndex) {
      //weighted random
      if (selectionType === 'Random weight') {
        console.log('Inside random weight')
        const { item: randomFather, index: randomFatherGenomeIndex } = weightedRandom<Genome>(
          generation,
          fitnessPerOldGenome
        )

        const { item: randomMother, index: randomMotherGenomeIndex } = weightedRandom<Genome>(
          generation,
          fitnessPerOldGenome
        )

        father = randomFather
        fatherGenomeIndex = randomFatherGenomeIndex

        mother = randomMother
        matherGenomeIndex = randomMotherGenomeIndex
      }
      //weighted random

      //RouletteWheel Selection
      if (selectionType === 'Roullete wheel') {
        //console.log('Inside roulletee')
        //console.log(!father || !mother || fatherGenomeIndex === matherGenomeIndex)
        let randomNumber = Math.random()
        fatherGenomeIndex = FindParentIndex(relativeFitness, randomNumber)
        father = generation[fatherGenomeIndex]
        console.log(father)
        console.log(fatherGenomeIndex)
        randomNumber = Math.random()
        matherGenomeIndex = FindParentIndex(relativeFitness, randomNumber)
        mother = generation[matherGenomeIndex]
        console.log(mother)
        console.log(matherGenomeIndex)
      }
      //RouletteWheel Selection

      //Rank Selection
      if (selectionType === 'Rank selection') {
        console.log('Inside rank')
        let randomNumber = Math.random()
        fatherGenomeIndex = FindParentIndexRankSelection(relativeFitness, indexList, randomNumber)
        father = fatherGenomeIndex ? generation[fatherGenomeIndex] : null
        randomNumber = Math.random()
        matherGenomeIndex = FindParentIndexRankSelection(relativeFitness, indexList, randomNumber)
        mother = matherGenomeIndex ? generation[matherGenomeIndex] : null
      }
      //Rank Selection

      //Tournament selection
      if (selectionType === 'Tournament') {
        console.log('Inside tournaments')
        for (let i = 0; i < 2; i++) {
          let randomList = []
          randomList = createRandomList(tournamentSize, size)
          let valueList: any = []
          randomList.forEach((random) => {
            valueList.push(fitnessList[random])
          })
          let maxIndex = randomList.indexOf(Math.max(valueList))
          if (i === 0) {
            fatherGenomeIndex = maxIndex
            father = generation[fatherGenomeIndex]
          } else {
            matherGenomeIndex = maxIndex
            mother = generation[matherGenomeIndex]
          }
        }
      }
      //Tournament selection
    }

    console.log('Outside while')

    //SELEKCIJA I KRIZANJE ISTOVREMENO -> KRIZANJE 2 RODITELJA DAJE 2 DJECE
    // Let father and mother produce two children.
    const [firstChild, secondChild] = mate(father, mother, mutationProbability, mutationType)

    newGeneration.push(firstChild)

    // Depending on the number of long-living champions it is possible that
    // there will be the place for only one child, sorry.
    if (newGeneration.length < generation.length) {
      newGeneration.push(secondChild)
    }
  }

  return newGeneration
}
