'use strict';

const {Model} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Post extends Model {
    }

    Post.init({
            title: {
                type: DataTypes.STRING,
                validate: {notEmpty: {msg: "Title must not be empty"}}
            },
            body: {
                type: DataTypes.STRING,
                validate: {notEmpty: {msg: "Body must not be empty"}}
            }
        }, {
            sequelize
        }
    );

    return Post;
};