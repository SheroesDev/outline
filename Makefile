up:
	#docker-compose up -d redis postgres s3
	docker-compose up -d redis
	docker-compose run --rm outline bash -c "yarn && yarn sequelize db:migrate"
	docker-compose up -d outline

build:
	docker-compose build --pull outline

test:
	docker-compose run --rm outline yarn test

watch:
	docker-compose run --rm outline yarn test:watch

destroy:
	docker-compose stop
	docker-compose rm -f

.PHONY: up build destroy test watch # let's go to reserve rules names
