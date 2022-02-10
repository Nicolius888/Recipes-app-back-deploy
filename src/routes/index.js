const { Router } = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config(); // dotenv package
const { API_KEY } = process.env; // and, the .env file
const { Recipe, Diet } = require("../db");

// Importar todos los routers;
// Ejemplo: const authRouter = require('./auth.js');

const router = Router();

router.use(
  cors({
    origin: "http://localhost:3000",
  })
);

//FUNCTIONS/GETS/FILTERS TO USE IN ROUTES:

//get api recipes
const getApiRecipes = async () => {
  const recipesGet = await axios.get(
    `https://api.spoonacular.com/recipes/complexSearch?apiKey=${API_KEY}&addRecipeInformation=true&number=100`
  );
  const recipesFiltered = await recipesGet.data.results.map((recipe) => {
    return {
      id: recipe.id,
      name: recipe.title,
      resume: recipe.summary,
      score: recipe.spoonacularScore - 90,
      healtScore: recipe.healthScore,
      steps: recipe.analyzedInstructions
        .map((e) => e.steps.map((el) => el.step))
        .flat(),
      img: recipe.image,
      dishTypes: recipe.dishTypes,
      Diets: recipe.diets,
    };
  });
  return recipesFiltered;
};

//only api diets
const getDiets = async () => {
  //all api data
  const dietsGet = await axios.get(
    `https://api.spoonacular.com/recipes/complexSearch?apiKey=${API_KEY}&addRecipeInformation=true&number=100`
  );
  //this returns a "big" object with "little" objects each one with the array of diets of each recipe
  const dietsFiltered = await dietsGet.data.results.map((types) => {
    return {
      type: types.diets.map((e) => e),
    };
  });

  //this is where we will push each type of diet only if it doesn's includes it
  const allTypes = ["vegetarian", "ketogenic"]; //this two arent included in the api, we included it manually, so the user can create using it.

  dietsFiltered.forEach((e) => {
    //for heach "little" object in the "big" one
    e.type.forEach((e) => {
      // and for each type of diet in the "little" object
      if (!allTypes.includes(e)) {
        //if it not exists in my allTypes array
        allTypes.push(e); //push it.
      }
      //and voilá we have all the diets, not repeated.
    });
  });
  //this create the diets in the DB
  const create = async () => {
    allTypes.forEach((name) => {
      Diet.findOrCreate({ where: { name: name } }); //this has to be findOrCreate to do the create just ONCE.
    });
    return allTypes;
  };
  //all this is to be used in /types route
  return create();
};

//this find created in DB recipes
const findFoods = async () => {
  let total = await Recipe.findAll({
    include: {
      model: Diet,
      as: "Diets",
      attributes: ["name"],
      through: {
        attributes: [],
      },
    },
  });
  return total;
};

//api recipes + DB created.
const getRecipes = async () => {
  const apiRecipes = await getApiRecipes();
  let dbFoods = await findFoods();
  let totalGet = apiRecipes.concat(dbFoods);
  return totalGet;
};
//ROUTES:                 ///////////////////////////////////////////////////////////////////////////////////////////////////////
router.get("/recipes", async (req, res) => {
  const recipes = await getRecipes();
  const { name } = req.query;
  //recipes alphabetically sort by name
  const recipesSort = await recipes.sort(function (a, b) {
    var nameA = a.name.toUpperCase();
    var nameB = b.name.toUpperCase();
    if (nameA < nameB) {
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    return 0;
  });
  //if there is a name query, filter and send only that one.
  if (name) {
    const nameSearch = await recipes.filter((recipe) =>
      recipe.name.toLowerCase().includes(name.toLowerCase())
    );
    if (nameSearch.length) {
      res.status(200).send(nameSearch);
    } else {
      res.status(404).send("Recipe not found, try again (◡‿◡*)");
    }
  } else {
    res.status(200).send(recipesSort);
  }
});

router.get("/recipes/:id", async (req, res) => {
  const { id } = req.params;
  const recipes = await getRecipes();
  //here we just filter api recipes + DB created recipes by id
  if (id) {
    let recipeId = await recipes.filter((recipe) => recipe.id == id);
    recipeId.length
      ? res.status(200).json(recipeId[0]) //to convert this [{}], to this {}
      : res.status(400).send("id not found (◡‿◡*)");
  }
});

router.get("/types", async (req, res) => {
  const diets = await getDiets(); //remember that we do the logic up there
  res.status(200).json(diets);
});

router.post("/recipes", async (req, res) => {
  const {
    name,
    resume,
    score,
    healtScore,
    steps,
    img,
    dishTypes,
    createdInDb,
    diets,
  } = req.body; //diets is an array with strings of types of diets

  const create = await Recipe.create({
    //create the recipe in the DB
    name,
    resume,
    score,
    healtScore,
    steps,
    img,
    dishTypes,
    createdInDb,
  });

  let dietIds = diets.map(
    async (dietName) => await Diet.findOne({ where: { name: dietName } }) //find diets by name, one by one, with map
  );

  dietIds = await Promise.all(dietIds); //resolve it

  dietIds = dietIds.map((diet) => diet.id); //filter the diets by id

  dietIds.map(async (id) => {
    //set the relationship by id, and add it to the recipe creator
    await create.addDiets(id);
  });
  res.status(201).json(create); //return the "201 created", and the recipe created.
});

module.exports = router;
